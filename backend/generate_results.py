import json
from pathlib import Path
import matplotlib.pyplot as plt

def generate_results():
    eval_json_path = Path("models/model.evaluation.json")
    if not eval_json_path.exists():
        eval_json_path = Path("models/model_v2.evaluation.json")
    
    data = json.loads(eval_json_path.read_text())
    m = data["metrics"]
    cm = data["confusion_matrix"]["matrix"]
    
    # Target directory C:\sihproject\results
    results_dir = Path("../results")
    results_dir.mkdir(parents=True, exist_ok=True)

    # Markdown report
    md = f"""# MediScan AI — Clinical Model Evaluation Report

**Model Architecture**: ResNet50 (Transfer Learning)  
**Evaluated Dataset**: Real Kaggle Chest X-Ray Hold-Out Test Set ({data['num_samples']} samples)  
**Positive (Abnormal) Class**: Pneumonia  

---

## 📊 Clinical Summary Metrics

| Clinical Metric | Score | Percentage |
| :--- | :--- | :--- |
| **Accuracy** | `{m['accuracy']:.4f}` | **{m['accuracy']*100:.2f}%** |
| **Balanced Accuracy** | `{m['balanced_accuracy']:.4f}` | **{m['balanced_accuracy']*100:.2f}%** |
| **Sensitivity (Recall)** | `{m['sensitivity']:.4f}` | **{m['sensitivity']*100:.2f}%** |
| **Specificity** | `{m['specificity']:.4f}` | **{m['specificity']*100:.2f}%** |
| **Precision** | `{m['precision']:.4f}` | **{m['precision']*100:.2f}%** |
| **F1 Score** | `{m['f1']:.4f}` | **{m['f1']*100:.2f}%** |
| **ROC AUC** | `{m['auc']:.4f}` | **{m['auc']*100:.2f}%** |

---

## 📉 Confusion Matrix

| Actual \\ Predicted | Predicted NORMAL | Predicted PNEUMONIA | Total |
| :--- | :--- | :--- | :--- |
| **Actual NORMAL** | **{cm[0][0]}** (True Negatives) | **{cm[0][1]}** (False Positives) | {cm[0][0] + cm[0][1]} |
| **Actual PNEUMONIA** | **{cm[1][0]}** (False Negatives) | **{cm[1][1]}** (True Positives) | {cm[1][0] + cm[1][1]} |

---

## 📸 Generated Visual Charts
- ![Confusion Matrix](confusion_matrix.png)
- ![Metrics Chart](metrics_chart.png)
"""
    (results_dir / "evaluation_report.md").write_text(md, encoding="utf-8")
    print(f"Generated markdown: {results_dir / 'evaluation_report.md'}")

    # Plot Confusion Matrix
    fig, ax = plt.subplots(figsize=(6, 5))
    cax = ax.matshow(cm, cmap='Blues')
    fig.colorbar(cax)
    
    classes = ["NORMAL", "PNEUMONIA"]
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(classes)
    ax.set_yticklabels(classes)
    
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(cm[i][j]), va='center', ha='center', color='white' if cm[i][j] > 150 else 'black', fontsize=14, fontweight='bold')
            
    plt.title('MediScan AI Confusion Matrix', pad=20)
    plt.xlabel('Predicted Label')
    plt.ylabel('True Label')
    plt.tight_layout()
    plt.savefig(results_dir / "confusion_matrix.png", dpi=150)
    plt.close()

    # Plot Bar Chart
    fig, ax = plt.subplots(figsize=(8, 4.5))
    names = ['Sensitivity', 'Specificity', 'Precision', 'Accuracy', 'ROC AUC']
    vals = [m['sensitivity']*100, m['specificity']*100, m['precision']*100, m['accuracy']*100, m['auc']*100]
    colors = ['#10B981', '#00B4D8', '#6366F1', '#8B5CF6', '#EC4899']
    
    bars = ax.bar(names, vals, color=colors, width=0.55)
    ax.set_ylim(0, 105)
    ax.set_ylabel('Percentage (%)')
    ax.set_title('MediScan AI ResNet50 Clinical Metrics')
    
    for bar in bars:
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2.0, yval + 1.5, f"{yval:.1f}%", ha='center', va='bottom', fontweight='bold')
        
    plt.tight_layout()
    plt.savefig(results_dir / "metrics_chart.png", dpi=150)
    plt.close()
    print(f"Generated charts in {results_dir}")

if __name__ == "__main__":
    generate_results()
