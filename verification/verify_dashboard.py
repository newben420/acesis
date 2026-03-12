from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the dashboard
        page.goto("http://localhost:3000")

        # Wait for data to load
        time.sleep(5)

        # Check if the table is populated
        page.wait_for_selector("#upcomingBody tr")

        # Take a screenshot of the table showing truncation and buttons
        page.screenshot(path="verification/dashboard_final.png")

        # Check if Delete Upcoming button exists
        delete_btn = page.locator("button:has-text('Delete Upcoming')")
        if delete_btn.is_visible():
            print("Delete Upcoming button is visible.")
        else:
            print("Delete Upcoming button is NOT visible.")

        browser.close()

if __name__ == "__main__":
    run()
