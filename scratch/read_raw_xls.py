with open(r"d:\motor data\motor_scraper\testParameter_P80Ⅲ Pin Agricultural UAV Motor KV120.xls", "rb") as f:
    header = f.read(1000)
    print("Header bytes (raw):")
    print(header[:200])
    try:
        print("\nHeader text (utf-8):")
        print(header.decode("utf-8")[:500])
    except Exception as e:
        print("\nCould not decode as utf-8:", e)
        try:
            print("\nHeader text (utf-16):")
            print(header.decode("utf-16")[:500])
        except Exception as e2:
            print("Could not decode as utf-16:", e2)
