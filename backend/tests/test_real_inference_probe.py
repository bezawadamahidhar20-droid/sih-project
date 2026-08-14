"""One-off REAL inference probe (run with -s to see evidence).

Uploads a synthetic non-PHI chest-X-ray-like PNG, runs the real CNN pipeline
(upload -> validation -> preprocessing -> model inference -> Grad-CAM ->
DB record), then prints the recorded evidence. Used by the final independent
verification; intentionally asserts the engine is NOT the heuristic.
"""

import io

import numpy as np
from httpx import AsyncClient

from tests.test_security_idor import make_png_bytes


class TestRealInferenceProbe:
    async def test_full_real_pipeline_evidence(self, client, auth_headers, capsys):
        from app.core.config import get_settings

        png = make_png_bytes(size=256)

        upload = await client.post(
            "/api/v1/scans/upload",
            files={"file": ("synthetic_chest.png", png, "image/png")},
            headers=auth_headers,
        )
        assert upload.status_code == 201, upload.text

        import time

        t0 = time.time()
        predict = await client.post(
            f"/api/v1/predictions/predict/{upload.json()['id']}",
            headers=auth_headers,
        )
        elapsed = time.time() - t0
        assert predict.status_code == 200, predict.text
        data = predict.json()

        pred = data["prediction"]
        # Prove this is the real CNN, never the heuristic.
        assert pred["model_architecture"] == "resnet50"
        assert set(pred["all_probabilities"].keys()) == {"Normal", "Pneumonia"}
        assert 0.0 <= pred["confidence"] <= 1.0

        # Heatmap is served (real Grad-CAM artifact, decrypted from .enc).
        heatmap = await client.get(data["gradcam_overlay_url"], headers=auth_headers)
        assert heatmap.status_code == 200
        assert heatmap.content[:8] == b"\x89PNG\r\n\x1a\n"

        # PDF generated from the same encrypted artifacts.
        pdf = await client.get(f"/api/v1/predictions/{pred['id']}/pdf", headers=auth_headers)
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")

        settings = get_settings()
        from app.services.model_inference import get_model_service

        svc = get_model_service()
        print(
            "\n===== REAL INFERENCE EVIDENCE =====\n"
            f"model_path      : {settings.model_path}\n"
            f"model_loaded    : {svc.is_model_loaded}\n"
            f"engine          : {svc.engine}\n"
            f"device          : {svc.device}\n"
            f"num_classes     : {settings.model_num_classes}\n"
            f"classes         : {settings.model_classes}\n"
            f"decision_thresh : {settings.model_decision_threshold}\n"
            f"predicted_class : {pred['predicted_class']}\n"
            f"confidence      : {pred['confidence']:.4f}\n"
            f"probabilities   : {pred['all_probabilities']}\n"
            f"processing_ms   : {pred['processing_time_ms']:.1f}\n"
            f"api_roundtrip_s : {elapsed:.2f}\n"
            f"gradcam_url     : {data['gradcam_overlay_url']}\n"
            f"heatmap_bytes   : {len(heatmap.content)} (PNG)\n"
            f"pdf_bytes       : {len(pdf.content)}\n"
            "===================================\n"
        )
