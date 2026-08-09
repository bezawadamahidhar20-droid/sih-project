#!/bin/bash
export OMP_NUM_THREADS=10
export MKL_NUM_THREADS=10
./.venv/Scripts/python.exe -m app.models.train \
  --data-dir ./data/chest_xray \
  --arch resnet50 \
  --epochs 8 \
  --batch-size 16 \
  --lr 1e-4 \
  --patience 4 \
  --positive-class PNEUMONIA \
  --output ./models/model.pth \
  > ./models/train.log 2>&1
echo "EXIT_CODE=$?" >> ./models/train.log
