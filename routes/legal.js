'use strict';

const { layout } = require('../lib/layout');
const { send } = require('../lib/http');

function page(ctx, title, content) {
  send(ctx.res, layout({
    title,
    currentUser: ctx.currentUser,
    session: ctx.session,
    body: `<section class="section container"><div class="panel" style="max-width:900px;margin:0 auto;line-height:1.65;">${content}</div></section>`,
  }));
}

module.exports = function (router) {
  router.get('/terms', async (ctx) => page(ctx, 'Terms of Service', `
    <h1>Terms of Service</h1>
    <p class="muted">Last updated: September 10, 2026</p>
    <p>Welcome to GoBookr. These Terms of Service govern your use of GoBookr and its services. By creating an account or using GoBookr, you agree to these Terms.</p>
    <h2>1. What GoBookr Does</h2>
    <p>GoBookr is a discovery marketplace that helps customers find personal-service professionals and connect to their booking options. GoBookr does not perform the services listed by professionals and is not a party to appointments or transactions completed through an external scheduling provider.</p>
    <h2>2. Accounts and Professional Listings</h2>
    <p>You must provide accurate, current information and keep your account secure. Professionals are responsible for their profile information, qualifications, licenses, pricing, services, availability, external booking links, and compliance with applicable laws and professional requirements.</p>
    <h2>3. Professional Membership, Trial, and Renewal</h2>
    <p>Eligible professional accounts receive a 30-day free trial. Paid membership is $15 per month. A professional must complete GoBookr's billing setup before paid renewal can occur. If billing is activated, the membership renews automatically each month using the payment method managed through GoBookr's payment processor unless canceled. If the trial ends before billing is activated, the professional listing may be hidden until billing is completed. Applicable taxes may be added where required. GoBookr will disclose material pricing changes before they take effect.</p>
    <h2>4. Cancellation</h2>
    <p>Professionals may cancel their subscription through the subscription-management tools provided by GoBookr. Unless otherwise stated during cancellation, cancellation takes effect at the end of the current paid billing period. Canceling prevents future renewal charges but does not ordinarily create a refund for time already paid.</p>
    <h2>5. Failed Payments</h2>
    <p>If a recurring payment fails, GoBookr may retry the payment and provide a 7-day grace period. During that grace period, the professional may update their payment method and the listing may remain visible. If payment remains unpaid after the grace period, GoBookr may temporarily hide or restrict the professional listing until the account returns to good standing. Account data may be retained so the membership can be restored after payment.</p>
    <h2>6. Payments and External Booking</h2>
    <p>Subscription payments may be processed by a third-party payment processor. GoBookr does not intend to store raw payment-card or bank-account credentials. When customers follow a professional's external booking link, that third-party service's terms and privacy practices apply.</p>
    <h2>7. Licenses and Verification</h2>
    <p>Professionals are responsible for maintaining any license, registration, insurance, or certification required for their work. A verification indicator means GoBookr has performed the verification process described by the platform; it is not a guarantee of quality, safety, availability, or continued licensure.</p>
    <h2>8. Reviews and User Content</h2>
    <p>Users may not submit unlawful, fraudulent, misleading, abusive, infringing, or deceptive content. You retain ownership of content you submit, but grant GoBookr a non-exclusive license to host, display, reproduce, and use that content as reasonably necessary to operate and promote the service.</p>
    <h2>9. Prohibited Conduct</h2>
    <p>You may not misuse GoBookr, impersonate others, submit false information, interfere with the service, attempt unauthorized access, distribute malicious code, scrape the service in violation of applicable law or platform restrictions, or use GoBookr for unlawful activity.</p>
    <h2>10. Suspension and Termination</h2>
    <p>GoBookr may suspend or terminate accounts that violate these Terms, create risk for users or the service, remain unpaid, or must be restricted to comply with law. Where appropriate, GoBookr may provide notice or an opportunity to resolve the issue.</p>
    <h2>11. Disclaimers</h2>
    <p>GoBookr is provided on an “as is” and “as available” basis to the extent permitted by law. GoBookr does not guarantee that a professional, customer, review, listing, external booking system, or service outcome will meet a user's expectations.</p>
    <h2>12. Limitation of Liability</h2>
    <p>To the fullest extent permitted by applicable law, GoBookr and its operators will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service or services performed by third-party professionals. Rights that cannot legally be limited remain unaffected.</p>
    <h2>13. Changes to These Terms</h2>
    <p>GoBookr may update these Terms as the service evolves. Material changes will be communicated as appropriate, and continued use after an updated version becomes effective constitutes acceptance where permitted by law.</p>
    <h2>14. Contact</h2>
    <p>Questions about these Terms can be submitted through GoBookr's official support contact once published on the service.</p>
    <p class="muted"><strong>Draft notice:</strong> These Terms are an operational draft for GoBookr and should be reviewed by qualified legal counsel before public launch.</p>
  `));

  router.get('/privacy', async (ctx) => page(ctx, 'Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="muted">Last updated: September 10, 2026</p>
    <p>This Privacy Policy explains how GoBookr collects, uses, shares, and protects information when you use the service.</p>
    <h2>1. Information We Collect</h2>
    <p>We may collect account information such as name and email address; professional profile information such as business name, workplace address, services, pricing, biography, portfolio content, license information, social links, and booking links; and technical information associated with use of the service.</p>
    <h2>2. Location Information</h2>
    <p>With permission, GoBookr may use a customer's device location to calculate distance to professionals and improve local search. Professionals may provide a workplace address or location so GoBookr can display relevant local results and distance information.</p>
    <h2>3. Payment Information</h2>
    <p>Professional subscription payments may be processed by a third-party payment processor such as Stripe. GoBookr does not intend to store raw card numbers or raw bank-account credentials. Payment processors may collect and process payment information under their own privacy terms.</p>
    <h2>4. How We Use Information</h2>
    <p>We use information to create and operate accounts, display professional listings, provide search and distance features, manage subscriptions, support users, prevent abuse, improve GoBookr, communicate service information, and comply with legal obligations.</p>
    <h2>5. How We Share Information</h2>
    <p>Professional profile information is intended to be publicly visible. We may share other information with service providers that help operate GoBookr, such as hosting, analytics, communications, mapping/geocoding, storage, and payment providers. We may also disclose information when required by law or to protect users, GoBookr, or others.</p>
    <h2>6. External Services</h2>
    <p>Professional profiles may link to third-party scheduling websites and other external services. GoBookr is not responsible for the privacy practices of those third parties, and users should review their policies before providing information.</p>
    <h2>7. Data Retention</h2>
    <p>We retain information for as long as reasonably necessary to operate the service, maintain legitimate business records, comply with legal obligations, resolve disputes, prevent fraud, and enforce agreements. Retention periods may vary by type of information.</p>
    <h2>8. Security</h2>
    <p>GoBookr uses reasonable administrative, technical, and organizational measures designed to protect information. No internet service can guarantee absolute security.</p>
    <h2>9. Your Choices</h2>
    <p>Users may update certain account and profile information through GoBookr. Where applicable law provides additional privacy rights, users may contact GoBookr to request access, correction, deletion, or other available rights, subject to legal exceptions.</p>
    <h2>10. Children's Privacy</h2>
    <p>GoBookr is not intended for children under 13, and we do not knowingly seek personal information from children under 13.</p>
    <h2>11. Changes to This Policy</h2>
    <p>We may update this Privacy Policy as GoBookr changes. The updated policy will display a revised effective date, and material changes will be communicated as appropriate.</p>
    <h2>12. Contact</h2>
    <p>Privacy questions or requests can be submitted through GoBookr's official support contact once published on the service.</p>
    <p class="muted"><strong>Draft notice:</strong> This Privacy Policy is an operational draft for GoBookr and should be reviewed by qualified legal counsel before public launch.</p>
  `));
};