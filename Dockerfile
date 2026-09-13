FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/opt/huggingface \
    TRANSFORMERS_CACHE=/opt/huggingface \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-backend.txt ./
# This image is intentionally CPU-only. Installing the generic torch package
# on Linux currently pulls a multi-gigabyte CUDA runtime that this container
# cannot use. Install the official CPU wheel first, then install the remaining
# requirements; the existing `torch` requirement is already satisfied.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && grep -Ev '^(torch|torchvision)[[:space:]]*$' requirements-backend.txt > /tmp/requirements-no-torch.txt \
    && pip install --no-cache-dir -r /tmp/requirements-no-torch.txt

COPY app ./app
COPY download_models.py docker-entrypoint.sh ./

RUN mkdir -p /app/models /app/data/ledger \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 8000

CMD ["/app/docker-entrypoint.sh"]
