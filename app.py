import json                        # loads cases.json and parses/serializes chat payloads
import os                          # reads FLASK_SECRET_KEY from the environment
import random                      # picks a random case for a new session
import re                          # strips the [[CASE_COMPLETE]] marker out of interviewer replies
from datetime import date          # used to detect when a new calendar day starts, to reset the daily count
from dotenv import load_dotenv     # loads variables from .env into the environment
from flask import Flask, render_template, request, session, jsonify, redirect, url_for
from charts import render_exhibit_svg
from grading import interview_response, grade_case, GRADING_CATEGORY_KEYS, CASE_COMPLETE_MARKER

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("FLASK_SECRET_KEY is not set. Add it to your .env file.")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # Loopback addresses (localhost/127.0.0.1) are treated as a secure context by browsers even
    # over plain http, so this stays True for local dev too — it only actually matters once this
    # is deployed on a real domain, where it stops the session cookie from ever being sent unencrypted.
    SESSION_COOKIE_SECURE=True,
)

with open(os.path.join(os.path.dirname(__file__), "cases.json")) as f:
    CASES = json.load(f)
CASES_BY_ID = {c["id"]: c for c in CASES}

DIFFICULTIES = ["beginner", "intermediate", "interview_ready"]
DIFFICULTY_LABELS = {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "interview_ready": "Interview Ready",
}
CASES_BY_DIFFICULTY = {d: [c for c in CASES if c["difficulty"] == d] for d in DIFFICULTIES}


def _cases_by_category(difficulty):
    pool = CASES_BY_DIFFICULTY[difficulty]
    by_category = {}
    for c in pool:
        by_category.setdefault(c["category"], []).append(c)
    return dict(sorted(by_category.items()))

# Gemini API key is on the free tier, which has its own hard daily request cap set by Google
# (roughly 1,000-1,500 requests/day for Flash-Lite, per Google's account-level dashboard rather
# than a number published in their docs). 800 is a deliberate safety margin under that ceiling —
# the app should hit its OWN limit first and fail with a friendly message, rather than Google's
# raw quota error surfacing to a user.
DAILY_GEMINI_LIMIT = int(os.environ.get("DAILY_GEMINI_LIMIT", "800"))  # shared cap across ALL customers combined
                                                                        # set to 0 or blank to disable
# A full case interview costs roughly 7-10 Gemini calls (one per chat turn, plus one for
# /end-case grading). 10 covers one case with a little headroom — kept close to actual case
# cost so the 800/day budget above spreads across ~80 distinct customers rather than a handful
# of heavy users exhausting it for everyone else.
PER_CUSTOMER_DAILY_LIMIT = int(os.environ.get("PER_CUSTOMER_DAILY_LIMIT", "10"))  # cap per individual customer
                                                                                   # set to 0 or blank to disable

# In-memory counter, shared by every request this process handles. Resets when the calendar date
# changes. Does NOT persist across restarts, and does NOT stay in sync across multiple worker
# processes if this is ever deployed with more than one — fine for a single small dyno/instance,
# not a substitute for real per-user billing controls at real scale.
_gemini_call_count = 0
_gemini_call_count_date = None


def _daily_limit_reached():
    global _gemini_call_count, _gemini_call_count_date
    today = date.today()
    if _gemini_call_count_date != today:
        _gemini_call_count_date = today
        _gemini_call_count = 0

    if DAILY_GEMINI_LIMIT and _gemini_call_count >= DAILY_GEMINI_LIMIT:
        return True

    _gemini_call_count += 1
    return False


def _customer_daily_limit_reached():
    # Tracked in the customer's own session cookie rather than server memory — this is what
    # already carries case_id/history per customer, so it's the natural place to also carry
    # "how many calls has THIS customer made today," without needing a database.
    today = date.today().isoformat()
    if session.get("usage_date") != today:
        session["usage_date"] = today
        session["usage_count"] = 0

    if PER_CUSTOMER_DAILY_LIMIT and session.get("usage_count", 0) >= PER_CUSTOMER_DAILY_LIMIT:
        return True

    session["usage_count"] = session.get("usage_count", 0) + 1
    return False


def start_new_case():
    pool = CASES_BY_DIFFICULTY[session["difficulty"]]
    previous_id = session.get("case_id")
    candidates = [c for c in pool if c["id"] != previous_id] or pool
    case = random.choice(candidates)
    session["case_id"] = case["id"]
    session["history"] = []
    session["case_complete"] = False
    return case


def _render_case_page(case, **kwargs):
    exhibit_svg = None
    if case.get("exhibit"):
        exhibit_svg = render_exhibit_svg(case["exhibit"])
    return render_template(
        "index.html", case=case, difficulty_label=DIFFICULTY_LABELS.get(case["difficulty"], ""),
        exhibit_svg=exhibit_svg, case_complete=session.get("case_complete", False), **kwargs,
    )


@app.route("/")
def home():
    if session.get("difficulty") not in DIFFICULTIES:
        return render_template("levels.html", difficulties=DIFFICULTIES, labels=DIFFICULTY_LABELS)
    case = CASES_BY_ID.get(session.get("case_id"))
    if case is None:
        case = start_new_case()
    return _render_case_page(case, history=session.get("history", []))


@app.route("/levels")
def levels():
    return render_template("levels.html", difficulties=DIFFICULTIES, labels=DIFFICULTY_LABELS)


@app.route("/select-level", methods=["POST"])
def select_level():
    difficulty = request.form.get("difficulty")
    if difficulty not in DIFFICULTIES:
        return redirect(url_for("levels"), code=303)
    session["difficulty"] = difficulty
    session["case_id"] = None
    session["history"] = []
    session["case_complete"] = False
    return redirect(url_for("questions"), code=303)


@app.route("/questions")
def questions():
    if session.get("difficulty") not in DIFFICULTIES:
        return redirect(url_for("levels"), code=303)
    difficulty = session["difficulty"]
    return render_template(
        "questions.html",
        difficulty=difficulty,
        difficulty_label=DIFFICULTY_LABELS[difficulty],
        cases_by_category=_cases_by_category(difficulty),
    )


@app.route("/select-case", methods=["POST"])
def select_case():
    if session.get("difficulty") not in DIFFICULTIES:
        return redirect(url_for("levels"), code=303)
    case_id = request.form.get("case_id", type=int)
    case = CASES_BY_ID.get(case_id)
    if case is None or case["difficulty"] != session["difficulty"]:
        return redirect(url_for("questions"), code=303)
    session["case_id"] = case["id"]
    session["history"] = []
    session["case_complete"] = False
    return redirect(url_for("home"), code=303)


@app.route("/new", methods=["POST"])
def new_case():
    if session.get("difficulty") not in DIFFICULTIES:
        return redirect(url_for("levels"), code=303)
    start_new_case()
    return redirect(url_for("home"), code=303)


@app.route("/chat", methods=["POST"])
def chat():
    case_id = session.get("case_id")
    case = CASES_BY_ID.get(case_id)
    if case is None:
        return jsonify({"error": "No active case. Refresh the page to start one."}), 400

    user_message = (request.json or {}).get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    if _customer_daily_limit_reached():
        return jsonify({"error": "You've reached today's usage limit for this tool. Please come back tomorrow."}), 429

    if _daily_limit_reached():
        return jsonify({"error": "This tool has hit its site-wide usage limit for today. Please try again tomorrow."}), 429

    history = session.get("history", [])
    try:
        reply = interview_response(case, history, user_message)
    except Exception as e:
        print(f"interview_response failed: {e}")
        return jsonify({"error": "The interviewer had trouble responding just now. Please try again."}), 502

    case_complete = CASE_COMPLETE_MARKER in reply
    if case_complete:
        reply = re.sub(re.escape(CASE_COMPLETE_MARKER), "", reply).strip()
        session["case_complete"] = True

    history.append({"role": "user", "content": user_message})
    history.append({"role": "model", "content": reply})
    session["history"] = history

    return jsonify({"reply": reply, "case_complete": session.get("case_complete", False)})


@app.route("/end-case", methods=["POST"])
def end_case():
    case_id = session.get("case_id")
    case = CASES_BY_ID.get(case_id)
    if case is None:
        return redirect(url_for("home"), code=303)

    history = session.get("history", [])
    if not history:
        return redirect(url_for("home"), code=303)

    if _customer_daily_limit_reached():
        return _render_case_page(
            case, history=history,
            error="You've reached today's usage limit for this tool. Please come back tomorrow.",
        ), 429

    if _daily_limit_reached():
        return _render_case_page(
            case, history=history,
            error="This tool has hit its site-wide usage limit for today. Please try again tomorrow.",
        ), 429

    try:
        result = grade_case(case, history)
    except ValueError as e:
        print(f"Grading failed to parse: {e}")
        return _render_case_page(
            case, history=history,
            error="The AI response could not be understood. Please try finishing the case again.",
        ), 500
    except Exception as e:
        print(f"grade_case failed: {e}")
        return _render_case_page(
            case, history=history,
            error="Grading failed unexpectedly. Please try finishing the case again.",
        ), 502

    return render_template(
        "results.html",
        case=case,
        categories=[(key, result[key]) for key in GRADING_CATEGORY_KEYS],
        overall_summary=result.get("overall_summary", ""),
        hire_recommendation=result.get("hire_recommendation", ""),
    )


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1", port=int(os.environ.get("PORT", 5001)))
