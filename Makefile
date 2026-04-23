.PHONY: build build-frontend install dev clean

build-frontend:
	cd frontend && npm install && npm run build
	rm -rf src/chatviz/static
	cp -r frontend/dist src/chatviz/static

build: build-frontend
	pip install -e .

install:
	pip install -e .

dev:
	python -m chatviz

clean:
	rm -rf frontend/dist src/chatviz/static dist build
	find . -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
