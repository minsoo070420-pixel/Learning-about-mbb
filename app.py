import json                        # loads cases.json and parses/serializes chat payloads
import os                          # reads FLASK_SECRET_KEY from the environment
import random                      # picks a random case for a new session
from dotenv import load_dotenv     # loads variables from .env into the environment
from flask import Flask, render_template, request, session, jsonify, redirect, url_for
from grading import interview_response, grade_case, GRADING_CATEGORY_KEYS

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("FLASK_SECRET_KEY is not set. Add it to your .env file.")

with open(os.path.join(os.path.dirname(__file__), "cases.json")) as f:
    CASES = json.load(f)
CASES_BY_ID = {c["id"]: c for c in CASES}


def start_new_case():
    case = random.choice(CASES)
    session["case_id"] = case["id"]
    session["history"] = []
    return case


@app.route("/")
def home():
    case_id = session.get("case_id")
    case = CASES_BY_ID.get(case_id) if case_id else None
    if case is None:
        case = start_new_case()
    return render_template("index.html", case=case, history=session.get("history", []))


@app.route("/new", methods=["POST"])
def new_case():
    start_new_case()
    return redirect(url_for("home"))


@app.route("/chat", methods=["POST"])
def chat():
    case_id = session.get("case_id")
    case = CASES_BY_ID.get(case_id)
    if case is None:
        return jsonify({"error": "No active case. Refresh the page to start one."}), 400

    user_message = (request.json or {}).get("message", "").strip()
    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    history = session.get("history", [])
    reply = interview_response(case, history, user_message)

    history.append({"role": "user", "content": user_message})
    history.append({"role": "model", "content": reply})
    session["history"] = history

    return jsonify({"reply": reply})


@app.route("/end-case", methods=["POST"])
def end_case():
    case_id = session.get("case_id")
    case = CASES_BY_ID.get(case_id)
    if case is None:
        return redirect(url_for("home"))

    history = session.get("history", [])
    if not history:
        return redirect(url_for("home"))

    try:
        result = grade_case(case, history)
    except ValueError as e:
        print(f"Grading failed to parse: {e}")
        return render_template(
            "index.html", case=case, history=history,
            error="The AI response could not be understood. Please try finishing the case again.",
        ), 500

    return render_template(
        "results.html",
        case=case,
        categories=[(key, result[key]) for key in GRADING_CATEGORY_KEYS],
        overall_summary=result.get("overall_summary", ""),
        hire_recommendation=result.get("hire_recommendation", ""),
    )


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1", port=int(os.environ.get("PORT", 5001)))
