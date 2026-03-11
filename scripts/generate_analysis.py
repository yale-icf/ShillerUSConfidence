#!/usr/bin/env python3
"""Generate weekly market confidence analysis using the Claude API."""

import csv
import json
import os
import sys
from datetime import date, datetime

import anthropic

METHODOLOGY = (
    "These indices come from the Yale/Shiller U.S. Stock Market Confidence Surveys, "
    "which have tracked investor sentiment since 1989. Each month, roughly 100 wealthy "
    "individual investors and 100 institutional investment managers answer the same "
    "standardized questions. The consistency of those questions over 35+ years is what "
    "makes the data meaningful — you can actually compare investor psychology across very "
    "different market environments.\n\n"
    "The four indices each measure something distinct:\n\n"
    "• <strong>1-Year Confidence</strong>: The share who expect prices to be higher in 12 months.\n"
    "• <strong>Crash Confidence</strong>: The share who believe a crash in the next 6 months is very "
    "unlikely (under 10% probability). A low reading means most people think a crash is plausible.\n"
    "• <strong>Buy-on-Dips Confidence</strong>: The share who believe that after a 3% single-day "
    "market drop, prices would fully recover within two days.\n"
    "• <strong>Valuation Confidence</strong>: The share who do not believe the market is overvalued.\n\n"
    "Surveys were conducted semi-annually before 2001 and have been monthly since July 2001. "
    "Respondents rotate over time, but consistent characteristics — high income, investment "
    "experience — are maintained across the panel."
)

MARKET_CONTEXT_PLACEHOLDER = (
    "[PLACEHOLDER: Add 2-3 sentences about recent market news relevant to this month's "
    "readings — e.g. Fed decisions, major earnings, economic data, or geopolitical events.]"
)


def read_latest_rows(csv_path, n=3):
    """Return the last n months of data that have at least one non-empty value."""
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    valid = [r for r in rows if any(v.strip() for k, v in r.items() if k != "Date")]
    return valid[-n:]


def fmt_val(raw):
    """Parse a CSV cell to a rounded float, or None if empty."""
    s = raw.strip()
    if not s:
        return None
    try:
        return round(float(s), 1)
    except ValueError:
        return None


def format_data_block(rows):
    """Format rows into a readable text block for the prompt."""
    lines = []
    for row in rows:
        lines.append(f"\n{row['Date']}:")
        for key, val in row.items():
            if key != "Date" and val.strip():
                lines.append(f"  {key}: {val.strip()}")
    return "\n".join(lines)


def build_prompt(data_block, latest_row):
    date_obj = datetime.strptime(latest_row["Date"], "%Y-%m-%d")
    data_period = date_obj.strftime("%B %Y")
    today = date.today()
    week_of = f"{today.strftime('%B')} {today.day}, {today.year}"

    schema = {
        "week_of": week_of,
        "data_period": data_period,
        "executive_summary": "<string>",
        "key_findings": [
            {
                "index": label,
                "institutional_value": "<number>",
                "individual_value": "<number>",
                "headline": "<3-5 word headline>",
                "interpretation": "<1-2 sentences>",
                "direction": "<up|down|neutral>",
            }
            for label in [
                "1-Year Outlook",
                "Crash Confidence",
                "Buy-on-Dips",
                "Valuation Confidence",
            ]
        ],
        "detailed_analysis": "<3-4 short paragraphs separated by \\n\\n>",
        "market_context": MARKET_CONTEXT_PLACEHOLDER,
        "methodology": METHODOLOGY,
    }

    return f"""You are writing the weekly market confidence analysis for the Yale International Center for Finance website.

AUDIENCE: General readers — curious and intelligent, but not finance professionals. Plain English only.

DATA (last 3 months of Shiller U.S. Stock Market Confidence Indices):
{data_block}

Focus your analysis on the most recent month: {data_period}

WHAT THE INDICES MEASURE:
- 1-Year Confidence: % who expect prices higher in 12 months
- Crash Confidence: % confident a crash WON'T happen in the next 6 months. LOW = more crash worry.
- Buy-on-Dips Confidence: % who believe a 3% single-day drop would fully recover within 2 days
- Valuation Confidence: % who do NOT believe the market is overvalued
Two populations: Institutional (investment managers) and Individual (wealthy individuals).

TONE RULES — follow these carefully:
- Short and punchy. No lengthy paragraphs.
- Relatable analogies are welcome when they fit naturally.
- Be careful with causal claims. Offer multiple possible explanations.
- Use hedged language: "one reading of this...", "this could reflect...", "may suggest"
- Some institutional investors believe in market efficiency — for them, the current price IS correct by definition, making "overvaluation" a non-question. Acknowledge this as a legitimate view.
- Never predict market outcomes or imply one group is wrong.
- Not alarmist, not dismissive.

DIRECTION FIELD: Compare latest month to the prior month. "up" = index rose, "down" = fell, "neutral" = within ~3 percentage points either way.

Output ONLY valid JSON matching this schema exactly — no markdown, no explanation, no code fences:
{json.dumps(schema, indent=2)}"""


def generate(prompt):
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(repo_root, "static", "data", "confidence_indices.csv")
    out_path = os.path.join(repo_root, "static", "data", "weekly_analysis.json")

    print("Reading CSV data...")
    rows = read_latest_rows(csv_path)
    if not rows:
        print("ERROR: No data found in CSV.", file=sys.stderr)
        sys.exit(1)

    latest = rows[-1]
    print(f"Latest data point: {latest['Date']}")

    data_block = format_data_block(rows)
    prompt = build_prompt(data_block, latest)

    print("Calling Claude API...")
    raw = generate(prompt)

    try:
        analysis = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Claude returned invalid JSON: {e}", file=sys.stderr)
        print("Raw response:", raw, file=sys.stderr)
        sys.exit(1)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)

    print(f"Analysis written to {out_path}")


if __name__ == "__main__":
    main()
