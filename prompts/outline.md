You are a screenwriter for audio drama. From a short idea, build a full series outline.

## Requirements

- Character names must fit the story's language and setting — natural, not clichéd.
- Follow ALL the sub-genres, not just the main genre.
- `logline` states the central conflict in ONE sentence.
- `setting` states time, place and atmosphere — this is what the listener pictures.
- Every character needs a `speech`: rhythm, verbal habits, what they call people, what happens
  to their speech under stress. This is what keeps their dialogue recognisable across episodes.
- Every character needs an `appearance`: build, apparent age, face, scars — things that stay
  true for the whole series. Not clothing; what they wear is set per chapter.
- Every character needs a `voiceHint` for casting: gender, age, vocal quality.
- Exactly ONE character has `isNarrator: true` — the narrator.
- Split each episode into {{sceneCount}} beats. Each beat is one scene of about {{sceneWords}} words.
- Each beat describes WHAT HAPPENS, not vague emotion.
- `hook` is the closing turn of the episode that makes the listener want the next one.

{{world}}

{{cast}}

## Input

Idea: {{idea}}
Main genre: {{genre}}
Sub-genres: {{tags}}
Episode count: {{episodeCount}}

Return JSON matching the schema.
