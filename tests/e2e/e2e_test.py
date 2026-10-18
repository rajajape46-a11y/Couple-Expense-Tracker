import re, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3100"
SHOTS = "/home/claude/e2e/shots"
results = []


def check(name, fn):
    try:
        fn()
        results.append(("PASS", name))
    except Exception as e:  # noqa
        results.append(("FAIL", f"{name}: {e}"))


def sql(q):
    return subprocess.run(["su", "postgres", "-c", f'psql -tA -d cet_e2e -c "{q}"'],
                          capture_output=True, text=True).stdout.strip()


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, timezone_id="Australia/Melbourne")
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())

    page.goto(BASE + "/")
    check("signed-out visitor is sent to /login", lambda: expect(page).to_have_url(re.compile("/login$")))
    page.screenshot(path=f"{SHOTS}/01-login.png")

    page.fill("input[name=email]", "raja@example.com")
    page.fill("input[name=password]", "wrong")
    page.click("button[type=submit]")
    check("wrong password shows an error", lambda: expect(page.get_by_text("Email or password is incorrect.")).to_be_visible())

    page.fill("input[name=password]", "test1234")
    page.click("button[type=submit]")
    expect(page).to_have_url(BASE + "/")
    check("home greets Raja", lambda: expect(page.get_by_role("heading", name="Hi Raja")).to_be_visible())
    check("home shows all-time settle-up from imported data",
          lambda: expect(page.get_by_text("Jo owes Raja $6,280.39")).to_be_visible())
    page.screenshot(path=f"{SHOTS}/02-home.png", full_page=True)

    # ---- quick add with merchant memory
    page.goto(BASE + "/add")
    page.fill("#amount", "12.50")
    page.get_by_role("button", name="Coles Supermarket").click()
    check("merchant memory fills category", lambda: expect(page.get_by_role("button", name="Food & Groceries")).to_have_attribute("aria-pressed", "true"))
    check("merchant memory fills sub-category", lambda: expect(page.get_by_role("button", name="Supermarket & Groceries")).to_have_attribute("aria-pressed", "true"))
    check("merchant memory hint shown", lambda: expect(page.get_by_text("Filled in from your last")).to_be_visible())
    page.screenshot(path=f"{SHOTS}/03-add-filled.png", full_page=True)
    page.get_by_role("button", name="Save & add another").click()
    check("save & add another confirms and clears", lambda: (
        expect(page.get_by_role("status")).to_contain_text("Saved Coles Supermarket"),
        expect(page.locator("#amount")).to_have_value("")))

    # ---- validation: missing category
    page.fill("#amount", "40")
    page.fill("input[name=merchant]", "Bunnings Warehouse")
    page.get_by_role("button", name="Save", exact=True).click()
    check("validation message when category missing", lambda: expect(page.get_by_role("status")).to_contain_text("Pick a category"))

    page.get_by_role("button", name="Housing & Rent").click()
    page.get_by_role("button", name="Household Supplies").click()
    page.get_by_role("button", name="Variable Wants").click()
    page.get_by_role("button", name="Jo only").click()
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page).to_have_url(re.compile(r"/transactions\?month="))
    check("new expense appears in list", lambda: expect(page.get_by_text("Bunnings Warehouse")).to_be_visible())
    page.screenshot(path=f"{SHOTS}/04-list.png", full_page=True)

    check("database has both new rows",
          lambda: (lambda n: None if n == "58" else (_ for _ in ()).throw(AssertionError(n)))(sql("select count(*) from transactions where deleted_at is null")))
    check("Jo-only split stored correctly", lambda: (lambda v: None if v == "personal|Jo" else (_ for _ in ()).throw(AssertionError(v)))(
        sql("select t.split_type||'|'||p.name from transactions t join people p on p.id=t.personal_for where merchant='Bunnings Warehouse'")))

    # ---- edit
    page.get_by_text("Bunnings Warehouse").click()
    expect(page).to_have_url(re.compile(r"/transactions/[0-9a-f-]{36}$"))
    page.fill("#amount", "35.95")
    page.get_by_role("button", name="Save changes").click()
    expect(page).to_have_url(re.compile(r"/transactions\?month="))
    check("edit updates the amount", lambda: expect(page.get_by_role("link", name=re.compile("Bunnings Warehouse.*\\$35\\.95"))).to_be_visible())

    # ---- search + month navigation
    page.fill("input[name=q]", "myki")
    page.get_by_role("button", name="Go").click()
    check("search filters list", lambda: expect(page.get_by_text("Bunnings Warehouse")).to_have_count(0))
    page.get_by_role("link", name="Previous month").click()
    check("previous month shows September", lambda: expect(page.get_by_text("September 2026")).to_be_visible())

    # ---- delete
    page.goto(BASE + "/transactions")
    page.get_by_text("Bunnings Warehouse").click()
    page.get_by_role("button", name="Delete expense").click()
    expect(page).to_have_url(re.compile(r"/transactions\?month="))
    check("delete removes it from the list", lambda: expect(page.get_by_text("Bunnings Warehouse")).to_have_count(0))
    check("delete is a soft delete", lambda: (lambda v: None if v == "1" else (_ for _ in ()).throw(AssertionError(v)))(
        sql("select count(*) from transactions where merchant='Bunnings Warehouse' and deleted_at is not null")))

    # ---- settings: categories
    page.goto(BASE + "/settings")
    add = page.locator("form").filter(has_text="Add a category")
    add.locator("input[name=name]").fill("Pets")
    add.locator("input[name=monthly_budget]").fill("100")
    add.get_by_role("button", name="Add").click()
    check("new category added", lambda: expect(page.locator("summary").filter(has_text="Pets")).to_be_visible())
    page.locator("summary").filter(has_text="Pets").click()
    pets = page.locator("details").filter(has=page.locator("summary", has_text="Pets"))
    pets.locator("input[name=name][placeholder='New sub-category']").fill("Vet")
    pets.get_by_role("button", name="Add").click()
    check("new sub-category added", lambda: expect(pets.locator("input[value=Vet]")).to_be_visible())
    page.screenshot(path=f"{SHOTS}/05-settings.png", full_page=True)
    dup = page.locator("form").filter(has_text="Add a category")
    dup.locator("input[name=name]").fill("Pets")
    dup.get_by_role("button", name="Add").click()
    check("duplicate category is rejected nicely", lambda: expect(dup.get_by_text("already exists")).to_be_visible())

    page.goto(BASE + "/add")
    page.get_by_role("button", name="Pets").click()
    check("new category & sub-category show on Add screen", lambda: expect(page.get_by_role("button", name="Vet")).to_be_visible())

    # ---- Jo sees the same household
    ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    p2 = ctx2.new_page()
    p2.goto(BASE + "/login")
    p2.fill("input[name=email]", "jo@example.com")
    p2.fill("input[name=password]", "test1234")
    p2.click("button[type=submit]")
    expect(p2).to_have_url(BASE + "/")
    check("Jo signs in and sees shared data", lambda: expect(p2.get_by_role("heading", name="Hi Jo")).to_be_visible())
    p2.goto(BASE + "/transactions")
    check("Jo sees Raja's Coles entry", lambda: expect(p2.get_by_text("Coles Supermarket").first).to_be_visible())

    # ---- sign out
    page.goto(BASE + "/settings")
    page.get_by_role("button", name="Sign out").click()
    expect(page).to_have_url(re.compile("/login$"))
    page.goto(BASE + "/transactions")
    check("after sign-out pages are protected", lambda: expect(page).to_have_url(re.compile("/login$")))
    browser.close()

for r in results:
    print(*r)
fails = [r for r in results if r[0] == "FAIL"]
print(f"\n{len(results) - len(fails)}/{len(results)} passed")
sys.exit(1 if fails else 0)
