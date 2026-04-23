import uvicorn


def main() -> None:
    uvicorn.run(
        "chatviz.server:app",
        host="0.0.0.0",
        port=7890,
        log_level="info",
    )


if __name__ == "__main__":
    main()
