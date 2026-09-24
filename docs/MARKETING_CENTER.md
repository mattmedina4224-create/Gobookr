# GoBookr Marketing Center

## Product goal

Help personal-service professionals fill more appointments. Marketing features should be judged by whether they increase discovery, profile visits, booking clicks, or appointments.

## Professional dashboard navigation

Planned primary navigation:

- Home
- Profile
- Portfolio
- Services
- Marketing
- Analytics
- Account

## Marketing Center

### Create a post

Campaign types:

- Openings Today
- Last-Minute Opening
- Now Booking This Week
- Book With Me
- New Service
- Show My Work

Professionals can choose a campaign type, select a portfolio image, choose a visual template, edit the message, preview it, and share it. Generated content should keep the professional as the focus while including tasteful GoBookr branding and a trackable GoBookr profile link.

### Content library

Professionals can upload reusable photos from their phone and maintain a queue of marketing assets.

### Schedule

Allow a professional to prepare content in advance and schedule it for supported connected social platforms. The scheduling system should support recurring schedules, pausing, rescheduling, replacing an image, and posting immediately.

Actual automatic publishing must use each social platform's supported APIs, authorization, account requirements, and permissions. Do not rely on unsupported automation or bypass platform restrictions.

### Results

Track at minimum:

- marketing post/share created
- campaign type
- share/publish event
- source/campaign identifier
- GoBookr profile visits attributed to the campaign
- booking-link clicks attributed to the campaign

Later, surface simple results such as posts shared, profile visits, and booking clicks.

## Trial activation

The 30-day professional trial should help the professional experience value before billing.

Suggested activation path:

1. Claim and complete profile.
2. Add photos, services, booking link, workplace, and socials.
3. Create and share the first GoBookr marketing post.
4. Continue sharing during the trial.
5. Show a trial recap with profile views, campaign traffic, and booking-link clicks.

The trial starts when an imported professional claim is approved, not when the claim is merely submitted.

## Growth loops

Consumer loop:

Professional shares GoBookr campaign -> follower visits GoBookr profile -> follower clicks booking link -> GoBookr gains consumer awareness.

Professional loop:

Professional shares GoBookr campaign -> another industry professional sees GoBookr -> finds/claims their listing -> uses Marketing Center -> shares their own GoBookr campaign.

## Implementation order

1. Finish claim-aware authentication and professional claim approval.
2. Establish analytics/event tracking and campaign attribution.
3. Add Marketing to the professional dashboard navigation.
4. Build Create a Post MVP with reusable templates and trackable profile URLs.
5. Add content library.
6. Add campaign results.
7. Add social account connections using supported platform APIs.
8. Add scheduling/queue and supported auto-publishing.
9. Add trial activation prompts and 30-day results recap.

## MVP boundaries

GoBookr should not try to replace Square, Booksy, Vagaro, or other scheduling/payment products. GoBookr's role is to help professionals get discovered and drive customers to their existing booking destination.

Initial Marketing Center work should focus on generating demand and measuring booking intent, not rebuilding appointment calendars or payment processing.
