"""
Automated walkthrough of the experiment in headless Chrome (Playwright).

    python3 -m http.server 8000          # from the experiment folder
    python3 tests/walkthrough.py         # in another terminal

Runs all four groups with ?debug=1&save=local, plus a "no consent" run and a
"Stop the study" run, and checks the saved JSON.
"""
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "http://localhost:8000/index.html"
CHROME = "/usr/bin/google-chrome"


def click_text(page, text):
    page.get_by_role("button", name=text, exact=True).click()


def ng_enter(page, code, expect_error=False):
    page.wait_for_selector("#ng-status:not(:empty)")
    page.keyboard.press("Space")
    page.wait_for_selector("#ng-input-area:not([hidden])")
    assert page.input_value("#ng-input") == "", "SPACE leaked into the input box"
    page.keyboard.type(code)
    page.keyboard.press("Enter")
    if expect_error:
        expect(page.locator("#ng-error")).not_to_be_empty()


def ng_done(page):
    page.wait_for_selector("#ng-done:not([hidden])")
    page.click("#ng-done")
    page.click("#ng-done")


def mock_datapipe(ctx, condition, captured):
    """Pretend a DataPipe ID is set and answer DataPipe's API locally."""
    def fake_config(route):
        body = route.fetch().text().replace("[12-character DataPipe ID]", "TESTID123456")
        route.fulfill(body=body, content_type="application/javascript")

    def fake_api(route):
        url = route.request.url
        if url.endswith("/condition/"):
            route.fulfill(json={"condition": condition})
        else:
            captured.append(route.request.post_data_buffer)
            route.fulfill(json={"message": "Success"})

    ctx.route("**/config.js", fake_config)
    ctx.route("https://pipe.jspsych.org/api/**", fake_api)


def run_group(pw_browser, group, outdir, datapipe=False):
    ctx = pw_browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    captured = []
    if datapipe:
        mock_datapipe(ctx, group - 1, captured)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if datapipe:
        page.goto(f"{BASE}?pid=test{group}")  # live mode: no group, no debug
    else:
        page.goto(f"{BASE}?debug=1&save=local&group={group}&pid=test{group}")

    # consent
    page.wait_for_selector("input[name=age18]")
    page.check("input[name=age18][value=yes]")
    page.check("input[name=agree][value=yes]")
    page.click("#jspsych-survey-html-form-next")
    expect(page.locator("#stop-study")).to_be_visible()

    # practice (do it twice to test the loop)
    click_text(page, "Start practice")
    for f in ["apple", "mango", "guava"]:
        ng_enter(page, f)
    click_text(page, "Practise again")
    for f in ["kiwi", "banana"]:
        ng_enter(page, f)
    ng_done(page)
    click_text(page, "I'm ready to go on")

    # recency task
    page.wait_for_selector("#le-input-0")
    high = group in (2, 4)
    page.fill("#le-input-0", "RS" if high else "new cafe in Tada")
    page.fill("#le-input-1", "hostel-newbie" if high else "library 3rd floor")
    page.wait_for_selector(".le-continue:not([disabled])", timeout=200000)
    page.click(".le-continue")
    if high:
        expect(page.locator("#le-error-0")).to_contain_text("initials")
        page.fill("#le-input-0", "climbing-wall-guy")
        page.click(".le-continue")

    # reminder
    page.wait_for_selector("#tw-text")
    page.fill("#tw-text", "short")
    page.wait_for_selector("#tw-continue:not([disabled])", timeout=200000)
    page.click("#tw-continue")
    expect(page.locator("#tw-nudge")).not_to_be_empty()
    page.fill("#tw-text", "A close relationship is valuable because " * 6)
    page.click("#tw-continue")

    # main name generator
    click_text(page, "Start")
    ng_enter(page, "chai-friend")
    # false start: SPACE then ESC
    page.keyboard.press("Space")
    page.wait_for_selector("#ng-input-area:not([hidden])")
    page.keyboard.press("Escape")
    ng_enter(page, "chai-friend", expect_error=True)  # duplicate
    page.fill("#ng-input", "amma")
    page.keyboard.press("Enter")
    ng_enter(page, "R.K.", expect_error=True)  # initials
    page.fill("#ng-input", "flatmate-blue")
    page.keyboard.press("Enter")
    ng_done(page)

    # control
    click_text(page, "Start")
    ng_enter(page, "canteen")
    ng_enter(page, "gym")
    ng_done(page)

    # who else
    page.wait_for_selector("#le-input-0")
    page.fill("#le-input-0", "amma")  # already listed -> must be rejected
    page.click(".le-continue")
    expect(page.locator("#le-error-0")).to_contain_text("already listed")
    page.fill("#le-input-0", "climbing-wall-guy")
    page.check("input[name=set_aside_0][value=Yes]")
    page.click(".le-continue")

    # per-person questions: 3 listed + 1 not listed
    click_text(page, "Start")
    for i in range(4):
        page.wait_for_selector(".pp-code")
        page.check("input[name=closeness][value='%d']" % (7 - i))
        page.check("input[name=first_met][value=longer_ago]" if i < 3 else "input[name=first_met][value=last_2_weeks]")
        page.check("input[name=see_freq][value='5']")
        page.check("input[name=think_freq][value='%d']" % (1 + i % 4))
        if i != 2:  # leave one question blank (skipping is allowed)
            page.check("input[name=sig_event][value=no]")
        page.click("#jspsych-survey-html-form-next")

    # checks
    page.wait_for_selector("input[name=calm_tense]")
    page.check("input[name=writing_relationships][value='5']")
    page.check("input[name=writing_specific_person][value=no]")
    page.check("input[name=calm_tense][value='2']")
    page.fill("textarea[name=strategy]", "family first")
    page.check("input[name=used_phone][value=no]")
    page.check("input[name=interrupted][value=no]")
    page.click("#jspsych-survey-html-form-next")

    if datapipe:
        click_text(page, "Save my responses")
        expect(page.locator("body")).to_contain_text("Your responses have been saved", timeout=15000)
        import gzip
        raw = captured[0]
        try:
            raw = gzip.decompress(raw)
        except OSError:
            pass
        payload = json.loads(raw)
        assert payload["experimentID"] == "TESTID123456"
        assert payload["filename"] == f"who-comes-to-mind_test{group}.json"
        path = Path(outdir) / f"dp{group}.json"
        path.write_text(payload["data"])
        ctx.close()
        return path, errors

    # debrief -> save -> download
    with page.expect_download() as dl:
        click_text(page, "Save my responses")
    path = Path(outdir) / f"g{group}.json"
    dl.value.save_as(path)
    expect(page.locator("body")).to_contain_text("Your responses have been saved")
    ctx.close()
    return path, errors


def check_data(path, group):
    data = json.loads(Path(path).read_text())
    by_role = {}
    for t in data:
        by_role.setdefault(t.get("trial_role"), []).append(t)
    main = by_role["ng_main"][0]
    assert main["n_items"] == 3 and main["n_false_starts"] == 1, main
    assert main["ended_by"] == "done_button"
    assert main["first_rt"] > 0
    rts = [it["rt_from_onset"] for it in main["items"]]
    assert rts == sorted(rts), rts
    assert all(it["latency_from_ready"] > 0 and it["typing_ms"] > 0 for it in main["items"])
    assert len(by_role["ng_practice"]) == 2
    summ = by_role["summary"][0]["summary"]
    persons = by_role["summary"][0]["persons"]
    assert summ["group"] == group
    assert summ["n_close"] == 3 and summ["n_places"] == 2 and summ["n_not_listed"] == 1
    assert summ["n_set_aside_yes"] == 1
    assert len(persons) == 4
    assert sum(p["source"] == "listed" for p in persons) == 3
    assert all(p["closeness"] is not None for p in persons)
    assert sum(p["sig_event"] is None for p in persons) == 1
    rec = by_role["recency_task"][0]
    assert rec["task_id"] == ("recency_people" if group in (2, 4) else "recency_places")
    rem = by_role["reminder_task"][0]
    assert rem["task_id"] == ("reminder_relational" if group in (3, 4) else "reminder_neutral")
    assert rem["nudged"] is True
    assert all(t.get("pid") == f"test{group}" for t in data)
    return summ


def run_not_configured(b):
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto(BASE)
    expect(page.locator("body")).to_contain_text("This study is not open yet")
    ctx.close()


def run_no_consent(b):
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}?debug=1&save=local")
    page.wait_for_selector("input[name=age18]")
    page.check("input[name=age18][value=no]")
    page.check("input[name=agree][value=yes]")
    page.click("#jspsych-survey-html-form-next")
    expect(page.locator("body")).to_contain_text("Nothing has been saved")
    ctx.close()


def run_withdraw(b):
    ctx = b.new_context(accept_downloads=True)
    page = ctx.new_page()
    downloads = []
    page.on("download", lambda d: downloads.append(d))
    page.goto(f"{BASE}?debug=1&save=local&group=4")
    page.check("input[name=age18][value=yes]")
    page.check("input[name=agree][value=yes]")
    page.click("#jspsych-survey-html-form-next")
    click_text(page, "Start practice")
    page.wait_for_selector("#ng-status:not(:empty)")
    page.click("#stop-study")
    click_text(page, "Keep going")
    ng_enter(page, "apple")  # still works after cancelling
    page.click("#stop-study")
    click_text(page, "Stop and leave")
    expect(page.locator("body")).to_contain_text("You have stopped the study")
    page.keyboard.press("Space")  # must not throw
    page.wait_for_timeout(500)
    assert not downloads, "data were saved after withdrawal"
    ctx.close()


if __name__ == "__main__":
    out = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True)
        for g in (1, 2, 3, 4):
            path, errs = run_group(b, g, out)
            assert not errs, errs
            s = check_data(path, g)
            print(f"group {g}: OK  first_rt_close={s['first_rt_close']} ms  first_rt_places={s['first_rt_places']} ms")
        if "--live" in sys.argv:
            # full-length timings: takes about 5 minutes
            path, errs = run_group(b, 3, out, datapipe=True)
            assert not errs, errs
            s = check_data(path, 3)
            assert s["assignment_method"] == "datapipe_balanced", s
            print("datapipe (mocked), live timings, balanced assignment: OK")
        run_not_configured(b)
        print("unconfigured live link blocked: OK")
        run_no_consent(b)
        print("no-consent path: OK")
        run_withdraw(b)
        print("withdraw path: OK")
        b.close()
    print("saved test files in", out)
