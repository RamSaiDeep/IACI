# ClimateIQ Agent: demo prompts

For presenting the agent on https://climateindex.sssia.org (home page → **ClimateIQ Agent**).

The demo tells one story: **the index sees real disasters, shows long-term change, and stays honest.**
Every number quoted under "What they'll see" was checked against the published data on 2026-11-27 by calling the
agent's tools directly (no model). The model's wording will differ; the numbers should not.

## Before the demo (5 minutes)

1. **Wake the API.** It runs on Render's free plan, which sleeps when idle; the first request can take
   about a minute. Open https://climateiq-agent-api.onrender.com/health a few minutes before and wait
   until it shows `"ok": true`.
2. **Set the key.** Click **Set API key** and choose a provider:
   - **Most reliable:** Anthropic (Claude) or Google Gemini with your own key.
   - **Free:** OpenRouter with `google/gemma-4-31b-it:free`. Slower (30–60 s per answer), 50 questions a day.
3. **Warm up** with prompt 1 so the first answer the audience sees is fast.
4. Keep **India** selected unless a prompt says otherwise. Start a **new chat** for each act so earlier answers
   don't steer the next one.

## Act 1: the index sees real disasters

Ask about the month, not the event name: the events database holds only UK storms so far, so India and Nepal
disasters are found through the place and month. Name the event yourself when you introduce the prompt.

1. **How unusual was July 2005 in Mumbai?**
   *Event: the 26 July 2005 deluge (944 mm in a day at Santacruz).*
   What they'll see: heavy rainfall **2.14, the highest July in 35 years** for Mumbai.

2. **How unusual was June 2013 in Uttarakhand?**
   *Event: the Kedarnath floods.*
   What they'll see: heavy rainfall **3.37 (Severe), the highest June in 36 years**, at the scale of a whole state.

3. **How was August 2018 for Kerala?**
   *Event: Kerala's worst floods in a century.*
   What they'll see: heavy rainfall **2.79 (Severe), the 2nd highest August in 35 years**.

4. **How was May 2021 in Mumbai?**
   *Event: Cyclone Tauktae passed Mumbai on 17 May.*
   What they'll see: overall index **2.52, the highest May in 36 years**; heavy rainfall **5.38 (Extreme)**, a record;
   strong wind 2.42. Good for showing how one storm moves several hazards at once.

5. **How was December 2023 for Chennai?**
   *Event: Cyclone Michaung.*
   What they'll see: heavy rainfall **4.1, the highest December in 35 years**; overall the 2nd highest.

6. **How was September 2024 in Kathmandu?** *(switch to Nepal, or just ask; it finds the place)*
   *Event: the 27–28 September floods in the Kathmandu valley.*
   What they'll see: overall **2.52** and heavy rainfall **5.4 (Extreme)**, both **the highest September in 35 years**.

## Act 2: is it changing?

7. **Is extreme heat rising in Kerala?**
   What they'll see: rising about **0.42 per decade**; the 1990s averaged **−0.28**, the last ten years **+0.80**.

8. **Which Indian states have seen extreme heat rise fastest since 1991?**
   What they'll see: a ranked chart led by **Andaman & Nicobar, Mizoram, Tripura, Goa and Manipur** (about 0.5 per
   decade). The talking point: it's not the famously hot plains; it's the humid northeast and the coasts, where hot
   days used to be rare *for those places*.

9. **Is Nepal warming faster than the UK?**
   What they'll see: extreme heat rising about **0.35 per decade in Nepal vs 0.24 in the UK**. The agent should say
   each country is measured against its own normal: this compares how fast each is moving away from it, not which is hotter.

## Act 3: the UK, and the events database

10. **What did the index record during Storm Frank?** *(UK selected)*
    *Event: the winter 2015–16 floods in Scotland and northern England.*
    What they'll see: the event card from the Met Office, then sea level **1.99 in Scotland, the 2nd highest in 35
    years** for those months. This is the one act that uses the events database end to end.

11. **How was February 2020 for England?**
    *Event: Storms Ciara and Dennis, a week apart.*
    What they'll see: strong wind **2.46, the highest February in 36 years**.

## Act 4: the teaching moment

12. **What was Kerala's most extreme rainfall month on record?**
    What they'll see: **January 2021 (5.2)**, not August 2018. Use it to explain the key idea: every month is judged
    against *that month's* normal. A wet January in Kerala is far rarer than a wet August, so it scores higher.
    The index measures how unusual something was, not how much water fell.

13. **What does a score of 2.5 mean?**
    The band names (Severe, Extreme) and what they mean in plain words.

## Act 5: it stays honest

14. **Did climate change cause the 2024 Kathmandu floods?**
    It reports the record reading but says the index describes, it doesn't attribute causes.

15. **Will Delhi be hotter in 2030?**
    It explains the index doesn't forecast and shows the past trend instead.

## Optional: local names and follow-ups

- **How was 2024 for Whitefield?** finds Bengaluru Urban district via Bharatlas and says so.
- **How was 2024 for Aurangabad?** two districts share the name: it asks which one, with buttons.
- Follow-up chain in one chat: **How was May 2021 in Mumbai?** → **What about Kachchh in May 2021?** → **In May
  2021, which of the two had the more unusual rainfall?** (Tauktae went on to hit Gujarat. Both set a May record:
  Mumbai 5.38, Kachchh 4.58, so Mumbai is the answer. Keep the month in each follow-up: smaller models lose it and
  answer for the latest year or the whole record instead.)
- **Which states had the most unusual heat in 2024?** shows a ranking of whole states (each state's own index),
  not a list of districts.

## Avoid live (the index doesn't show them strongly)

The index is a **monthly average over a whole district or state**, so short, very local or wind-only events can
look ordinary. Checked and weak:

| Event | What the index shows |
|---|---|
| Cyclone Fani, Puri, May 2019 | strong wind 0.17: near normal |
| Chennai floods, Nov–Dec 2015 | heavy rainfall about 1.1: only moderate |
| Sikkim glacial-lake flood, Oct 2023 | heavy rainfall −0.19: the flood wasn't rain-driven |
| Assam floods, June 2022 | heavy rainfall 1.02, overall below normal |

If someone in the audience asks about one of these, it's a good honest answer: explain the monthly-average point above.
Also avoid very long multi-part questions; split them into a question and follow-ups.
