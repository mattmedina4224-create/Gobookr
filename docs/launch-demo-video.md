# Website demo: script and recording plan

Target length: 60–75 seconds. Record the current deployed site at 375px and desktop. Use real public profiles; avoid showing account credentials, private claims, payment details or customer data. Do not present staged clicks as customer activity.

| Time | Shot | Voiceover |
|---|---|---|
| 0–8s | Homepage, search controls | “Find personal-service professionals near you with GoBookr.” |
| 8–20s | Search by a real category and city; show results | “Choose the service you need, add your city or ZIP, and explore local profiles.” |
| 20–32s | Open a real profile, show factual workplace and attribution | “See their specialties, workplace and booking options. Public-source listings can appear before the professional claims them.” |
| 32–40s | Booking button and correct external provider page; stop before booking | “Book through the professional’s existing scheduling provider and confirm availability there.” |
| 40–52s | Public claim page; stop before submitting a real claim | “Already listed? Claim your profile and provide ownership evidence for review.” |
| 52–64s | Approved demo professional dashboard, profile and marketing links | “Manage your profile, announce openings and prepare images and links to share.” |
| 64–75s | Pricing page and closing homepage | “GoBookr Professional offers a 30-day free trial, then $20 a month when paid billing is activated. Explore GoBookr.com.” |

## Screen-recording steps

1. Finish preview verification and deploy the approved build before recording.
2. Open browser developer tools responsive mode at 375 × 812. Enable screen recording with the operating system or a trusted recorder; capture the browser page without sensitive tabs.
3. Record each shot separately. Use a verified profile with a working booking URL and real results for the selected city/category. Do not invent empty-market results.
4. Record the professional dashboard using an approved demo account. Hide browser autofill, notifications and billing identifiers. Label demo shots as “Demo account.”
5. Assemble shots in order with simple cuts, record the narration above, and add readable captions. Use only licensed music, if any.
6. Export MP4 at 1080p and review on a phone. Check factual claims, text legibility, audio and external-link destination. A vertical 1080 × 1920 edition can use the same mobile shots.

The full 60–75-second recording remains a handoff. A separate 30-second public still-capture MP4 was rendered on October4; see the evidence below.

## Short public-only edition — 30 seconds

This version avoids unverified authenticated dashboard, marketing, approval and billing shots. Live desktop homepage → Fort Collins massage search → Sheila profile → claim entry was observed on October4. Earlier one-provider booking-page inspection did not submit an appointment. A fresh mobile recording and destination recheck are still required before publishing.

| Time | Shot | Narration/caption |
|---|---|---|
|0–5s|Clean homepage and service/city controls|“Find your next local beauty or wellness pro with gobookr.”|
|5–12s|Choose Massage Therapists, enter Fort Collins, click Search; show the actual two results|“Choose a service and your location. Browse real local listings.”|
|12–20s|Open Sheila O’Shaughnessy at Zen Therapies; show workplace and Book Appointment|“Explore a profile, then follow its booking link.”|
|20–26s|Verified external Zen Therapies service page; stop before selecting an appointment|“Check services and availability with the professional’s booking provider.”|
|26–30s|Return to homepage; simple closing caption|“Find your next favorite pro. gobookr.com.”|

Recording handoff: on Mac use Shift–Command–5, select Record Selected Portion, frame only the page, and record each shot. Press Stop in the menu bar. In an editor, trim to the timestamps above, add readable captions, and export H.264 MP4 with AAC audio. Review the exported file on an actual phone; confirm it plays and the provider link is still correct. Do not include notifications, login screens, payment details, customer activity claims, license claims or fabricated appointment availability.

## Rendered public still-capture edition — October4

Delivered `gobookr-public-demo-30s.mp4`: 30.000 seconds,1280×820,H.264/yuv420p with silent AAC audio and faststart. Four actual production desktop captures assembled with captions. On-screen label “Public walkthrough - still captures”; no continuous screen recording or narration.

|Time|Actual capture|Caption|
|---|---|---|
|0–7.5s|Homepage search controls|Choose a service and a city|
|7.5–15s|Two Fort Collins massage results|Browse local profiles|
|15–22.5s|Sheila profile522|Explore a profile and its booking link|
|22.5–30s|Public claim entry522|Already listed? Start a claim|

Desktop search/profile/claim-entry navigation observed before capture. No appointment, account or claim submitted. Provider availability, approval, dashboard and billing are not demonstrated/certified. Crops focus on relevant controls, not whole-page certification. No fabricated reviews, license badge, customer activity or third-party portfolio photos.

Validation: ffprobe confirmed codecs/duration; complete ffmpeg error-level decode exited0. Decoded frames at1,9,16,25 seconds visually reviewed. Actual phone playback remains untested. SHA256: `ee0d2385f037a4e3c24ae3660b9ab9d747264abb04abceff71764aca9ccc2c81`.

Reproduce: four actual JPEG captures named `gobookr-demo-{home,search,profile,claim}-20261004.jpg`; `python3 scripts/render-public-demo.py CAPTURE_DIR OUTPUT.mp4` (installed ffmpeg/DejaVuSans required). Application code unchanged. Full narrated mobile/desktop recording remains open.
