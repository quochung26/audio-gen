Read the episode below and return four things: a one-line index entry, an episode summary, the state of each character, and a list of discrete facts.

## `gist` — one sentence, at most 20 words

State the MAIN EVENT of the episode. This is the index line, loaded every time a later episode is written, so it has to be enough to recognise what this episode was about.

Example: "Tai drives his last passenger out to the Old Depot and finds seat 12 empty."

## `summary` — episode summary, 150–250 words

This summary is loaded as context when later episodes are written, so it must state:
- What happened, in order
- What is still left open

No commentary, no judgement. Just recount.

## `characters` — state at the end of the episode

List ONLY characters who APPEAR in this episode. For each of them, record where things stand as the episode ends:
- Where they are
- What they now know that they did not know before
- How their relationship with other characters has changed
- Whether they are alive, and whether they are hurt

Keep it short, 1–2 sentences each. This is what keeps later episodes from going wrong — no walking a dead character into a scene, no warmth between two people who just fell out.

Use each character's exact NAME from the list below; do not invent other names.

## `facts` — discrete facts

Break the episode into discrete facts, ONE sentence each. These are retrieved when later episodes are written, so every sentence must **stand on its own without rereading the episode**: name the character and the place, do not write "he" or "over there".

Classify `kind` correctly — they are used differently:

| kind | When | Example |
|---|---|---|
| `EVENT` | Something happened | "Tai drove his last passenger to the Old Depot at 2 a.m." |
| `REVELATION` | A character discovers something | "Tai found that no one had ever sat in seat 12." |
| `PROMISE` | An oath, a promise, a commitment | "Tai swore he would never go back to the Old Depot." |
| `RELATION` | A relationship changed | "Tai no longer believes what old Bay tells him." |
| `OBJECT` | An important object appears | "An old bus ticket dated the 30th of the twelfth lunar month, 1975." |
| `PLACE` | A meaningful location is introduced | "The Old Depot sits at the edge of town, abandoned since the storm." |
| `OPEN_THREAD` | **An open thread with no answer yet** | "No one knows who bought the ticket for seat 12." |

`OPEN_THREAD` matters most — it is a debt the story has to pay, and it is loaded every time a later episode is written. Do not miss any.

An episode usually has 5–12 facts. Do not list detail that has no bearing later (weather, scenery).

## Characters in the story

{{characters}}

## Episode content

{{text}}

Return JSON matching the schema.
