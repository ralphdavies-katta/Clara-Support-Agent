"""One-shot sync: Gmail -> classify. Run `python sync.py --loop` to repeat every 5 minutes."""
import sys, time
import fetch_gmail, classify

def run():
    fetch_gmail.main()
    classify.main()

if __name__ == "__main__":
    if "--loop" in sys.argv:
        while True:
            run()
            time.sleep(300)
    else:
        run()
