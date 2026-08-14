"""Seed script to populate the database with 6 DEMO scans + pre-computed predictions.

DEMO DATA — opt-in only:
    SEED_DEMO_SCANS=true python seed_demo_scans.py

The script refuses to run in a production environment unless SEED_DEMO_SCANS=true.
Seeded images are procedurally-generated synthetic scans (not patient data),
encrypted at rest like any real upload. Pre-computed predictions are clearly
fabricated DEMO data for presentation/browsing only.

Usage:
    python seed_demo_scans.py
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import async_session_maker, init_db
from app.db.models import Scan, Prediction, User, UserRole, ScanStatus
from app.core.config import get_settings
from app.core.security import get_password_hash, encrypt_file

DEMO_SCANS_DATA = [
    {
        "filename": "demo_chest_xray_normal.png",
        "patient_id": "PAT-DEMO-001",
        "modality": "X-Ray",
        "body_part": "CHEST",
        "predicted_class": "Normal",
        "confidence": 0.965,
        "probabilities": {"Normal": 0.965, "Pneumonia": 0.035, "Effusion": 0.02, "Cardiomegaly": 0.015, "Nodule": 0.01, "Atelectasis": 0.01},
        "is_low_confidence": False,
        "is_high_risk": False,
        "is_flagged": False,
    },
    {
        "filename": "demo_chest_xray_pneumonia.png",
        "patient_id": "PAT-DEMO-002",
        "modality": "X-Ray",
        "body_part": "CHEST",
        "predicted_class": "Pneumonia",
        "confidence": 0.924,
        "probabilities": {"Pneumonia": 0.924, "Normal": 0.076, "Effusion": 0.38, "Cardiomegaly": 0.12, "Nodule": 0.05, "Atelectasis": 0.18},
        "is_low_confidence": False,
        "is_high_risk": True,
        "is_flagged": True,
    },
    {
        "filename": "demo_ct_thoracic.png",
        "patient_id": "PAT-DEMO-003",
        "modality": "CT",
        "body_part": "CHEST",
        "predicted_class": "Atelectasis",
        "confidence": 0.841,
        "probabilities": {"Atelectasis": 0.841, "Normal": 0.159, "Pneumonia": 0.42, "Effusion": 0.22, "Cardiomegaly": 0.08, "Nodule": 0.11},
        "is_low_confidence": False,
        "is_high_risk": False,
        "is_flagged": False,
    },
    {
        "filename": "demo_xray_cardiomegaly.png",
        "patient_id": "PAT-DEMO-004",
        "modality": "X-Ray",
        "body_part": "CHEST",
        "predicted_class": "Cardiomegaly",
        "confidence": 0.887,
        "probabilities": {"Cardiomegaly": 0.887, "Normal": 0.113, "Pneumonia": 0.15, "Effusion": 0.45, "Nodule": 0.02, "Atelectasis": 0.09},
        "is_low_confidence": False,
        "is_high_risk": True,
        "is_flagged": False,
    },
    {
        "filename": "demo_xray_effusion.png",
        "patient_id": "PAT-DEMO-005",
        "modality": "X-Ray",
        "body_part": "CHEST",
        "predicted_class": "Effusion",
        "confidence": 0.912,
        "probabilities": {"Effusion": 0.912, "Normal": 0.088, "Pneumonia": 0.35, "Cardiomegaly": 0.28, "Nodule": 0.04, "Atelectasis": 0.21},
        "is_low_confidence": False,
        "is_high_risk": True,
        "is_flagged": True,
    },
    {
        "filename": "demo_mri_brain.png",
        "patient_id": "PAT-DEMO-006",
        "modality": "MRI",
        "body_part": "BRAIN",
        "predicted_class": "Normal",
        "confidence": 0.981,
        "probabilities": {"Normal": 0.981, "Pneumonia": 0.019, "Effusion": 0.005, "Cardiomegaly": 0.002, "Nodule": 0.01, "Atelectasis": 0.001},
        "is_low_confidence": False,
        "is_high_risk": False,
        "is_flagged": False,
    },
]


def _synthetic_scan_image(seed: int) -> bytes:
    """Procedurally generate a clearly-synthetic chest-X-ray-like PNG.

    Noise + smooth gradient + a few soft blobs — NOT a medical image and
    NOT patient data. Used so demo rows point at real encrypted artifacts.
    """
    import io

    import numpy as np
    from PIL import Image, ImageFilter

    rng = np.random.default_rng(seed)
    size = 512
    base = rng.normal(0.5, 0.12, (size, size)).astype(np.float32)
    # Soft blob(s) to look scan-like without resembling any anatomy.
    for _ in range(4):
        cy, cx = rng.integers(80, size - 80, 2)
        r = int(rng.integers(40, 90))
        yy, xx = np.ogrid[:size, :size]
        base += 0.35 * np.exp(-(((yy - cy) ** 2 + (xx - cx) ** 2) / (2 * r * r)))
    img = Image.fromarray(np.clip(base, 0, 1) * 255).convert("L").convert("RGB")
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def seed_demo_data():
    settings = get_settings()
    # Demo scan seeding is OPT-IN: SEED_DEMO_SCANS=true, or any non-production
    # environment (dev default). Never silently in production.
    if not (settings.seed_demo_scans or settings.environment != "production"):
        print(
            "[seed] SKIPPED — demo scan seeding is opt-in. "
            "Run with SEED_DEMO_SCANS=true (non-production) to populate "
            "demo scans and pre-computed predictions."
        )
        return

    await init_db()
    async with async_session_maker() as session:
        # Get or create admin/doctor user
        res = await session.execute(select(User).where(User.username == "doctor"))
        doctor = res.scalar_one_or_none()
        if not doctor:
            doctor = User(
                username="doctor",
                email="doctor@mediscan.ai",
                hashed_password=get_password_hash("doctor123"),
                full_name="Dr. Sarah Chen, MD",
                role=UserRole.DOCTOR,
                is_active=True,
            )
            session.add(doctor)
            await session.commit()
            await session.refresh(doctor)

        print(f"[seed] Using user '{doctor.username}' (id={doctor.id})")
        print("[seed] DEMO DATA — synthetic images + pre-computed predictions. Not for clinical use.")

        # Make sure the storage dirs exist before writing encrypted artifacts.
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        gradcam_dir = upload_dir / "gradcam"
        gradcam_dir.mkdir(parents=True, exist_ok=True)

        scans_created = 0
        for idx, item in enumerate(DEMO_SCANS_DATA):
            file_hash = uuid.uuid4().hex
            # Encrypt a real (synthetic, non-PHI) PNG so demo rows point at
            # actual artifacts the API can serve — no stale references.
            synthetic = _synthetic_scan_image(seed=idx + 1)
            encrypted_upload = upload_dir / f"{file_hash}.enc"
            with open(upload_dir / f"{file_hash}.png", "wb") as f:
                f.write(synthetic)
            encrypt_file(str(upload_dir / f"{file_hash}.png"), str(encrypted_upload))
            (upload_dir / f"{file_hash}.png").unlink(missing_ok=True)
            # Derived ORIGINAL render (encrypted at rest) so the scan image
            # is viewable in the UI. No fabricated Grad-CAM is created.
            with open(gradcam_dir / f"original_{file_hash}.png", "wb") as f:
                f.write(synthetic)
            encrypt_file(
                str(gradcam_dir / f"original_{file_hash}.png"),
                str(gradcam_dir / f"original_{file_hash}.png.enc"),
            )
            (gradcam_dir / f"original_{file_hash}.png").unlink(missing_ok=True)

            scan = Scan(
                file_hash=file_hash,
                original_filename=f"[DEMO] {item['filename']}",
                encrypted_path=str(encrypted_upload),
                file_size=len(synthetic),
                mime_type="image/png",
                anonymized_patient_id=item["patient_id"],
                study_date=datetime.now(timezone.utc),
                modality=item["modality"],
                body_part=item["body_part"],
                status=ScanStatus.COMPLETED,
                uploaded_by=doctor.id,
            )
            session.add(scan)
            await session.commit()
            await session.refresh(scan)

            pred = Prediction(
                scan_id=scan.id,
                user_id=doctor.id,
                predicted_class=item["predicted_class"],
                confidence=item["confidence"],
                all_probabilities=json.dumps(item["probabilities"]),
                model_version="ResNet50-v2",
                model_architecture="resnet50",
                processing_time_ms=185.0,
                is_low_confidence=item["is_low_confidence"],
                is_high_risk=item["is_high_risk"],
                is_flagged=item["is_flagged"],
                flagged_by=doctor.id if item["is_flagged"] else None,
                flagged_at=datetime.now(timezone.utc) if item["is_flagged"] else None,
            )
            session.add(pred)
            await session.commit()
            scans_created += 1

        print(f"[seed] Successfully seeded {scans_created} demo scans with pre-computed predictions!")

if __name__ == "__main__":
    asyncio.run(seed_demo_data())
