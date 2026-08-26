'use strict';

const db = require('../db');
const { layout } = require('../lib/layout');
const { redirect, send, flashFromQuery } = require('../lib/http');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/auth');
const { escapeHtml, initialsFrom } = require('../lib/util');

module.exports = function (router) {
  router.get('/login', async (ctx) => {
    if (ctx.currentUser) {
      return redirect(
        ctx.res,
        ctx.currentUser.role === 'pro'
          ? '/dashboard/pro'
          : '/dashboard/customer'
      );
    }

    const next = ctx.query.next || '';
    const body = `
      <section class="section container" style="max-width:560px;">
        <div class="panel">
          <h1>Log in</h1>
          <p class="muted">Welcome back to GoBookr.</p>

          <form method="POST" action="/login">
            <input type="hidden" name="next" value="${escapeHtml(next)}" />

            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" name="email" required />
            </div>

            <div class="field">
              <label for="password">Password</label>
              <div style="position:relative;">
  <input id="password" type="password" name="password" required style="padding-right:48px;" />
  <button type="button" onclick="const p=document.getElementById('password'); p.type=p.type==='password'?'text':'password';" style="position:absolute;right:44px;top:50%;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;font-size:18px;" aria-label="Show or hide password">👁</button>
</div>
            </div>

            <button class="btn block" type="submit">Log in</button>
          </form>

          <p class="muted" style="margin-top:18px;">
            New to GoBookr? <a href="/signup?role=customer">Create an account</a>
          </p>
        </div>
      </section>`;

    send(
      ctx.res,
      layout({
        title: 'Log in',
        currentUser: null,
        session: null,
        flash: flashFromQuery(ctx.query),
        body,
      })
    );
  });

  router.post('/login', async (ctx) => {
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const next = String(ctx.body.next || '');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return redirect(
        ctx.res,
        '/login?error=' + encodeURIComponent('Invalid email or password.')
      );
    }

    const token = createSession(user.id);
    setSessionCookie(ctx.res, token);

    if (next && next.startsWith('/')) {
      return redirect(ctx.res, next);
    }

    redirect(
      ctx.res,
      user.role === 'pro' ? '/dashboard/pro' : '/dashboard/customer'
    );
  });

  router.get('/signup', async (ctx) => {
    if (ctx.currentUser) return redirect(ctx.res, '/');

    const role = ctx.query.role === 'pro' ? 'pro' : 'customer';

    const body = `
      <section class="section container" style="max-width:620px;">
        <div class="panel">
          <h1>${role === 'pro' ? 'Join GoBookr as a professional' : 'Create your account'}</h1>

          <form method="POST" action="/signup">
            <input type="hidden" name="role" value="${role}" />

            <div class="field">
              <label for="name">Your name</label>
              <input id="name" name="name" required />
            </div>

            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" name="email" required />
            </div>

            <div class="field">
              <label for="password">Password</label>
              <input id="password" type="password" name="password" minlength="6" required />
            </div>

            ${
              role === 'pro'
                ? `
                  <div class="field">
                    <label for="business_name">Business name</label>
                    <input id="business_name" name="business_name" required />
                  </div>

                  <div class="field">
                    <label for="category">Service</label>
                    <select id="category" name="category" required>
                      <option value="barber">Barber</option>
                      <option value="stylist">Hairstylist</option>
                      <option value="colorist">Colorist</option>
                    </select>
                  </div>

                  <div class="field">
                    <label for="city">City</label>
                    <input id="city" name="city" required />
                  </div>

                  <div class="field">
                    <label for="state">State</label>
                    <input id="state" name="state" value="CO" required />
                  </div>
                `
                : ''
            }

            <button class="btn block" type="submit">Create account</button>
          </form>
        </div>
      </section>`;

    send(
      ctx.res,
      layout({
        title: 'Sign up',
        currentUser: null,
        session: null,
        flash: flashFromQuery(ctx.query),
        body,
      })
    );
  });

  router.post('/signup', async (ctx) => {
    const name = String(ctx.body.name || '').trim();
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const role = ctx.body.role === 'pro' ? 'pro' : 'customer';

    if (!name || !email || password.length < 6) {
      return redirect(
        ctx.res,
        `/signup?role=${role}&error=` +
          encodeURIComponent('Please complete all required fields.')
      );
    }

    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return redirect(
        ctx.res,
        `/signup?role=${role}&error=` +
          encodeURIComponent('An account with that email already exists.')
      );
    }

    const result = db
      .prepare(
        'INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)'
      )
      .run(email, hashPassword(password), role, name, '');

    const userId = result.lastInsertRowid;

    if (role === 'pro') {
      const businessName = String(ctx.body.business_name || '').trim();
      const category = ['barber', 'stylist', 'colorist'].includes(ctx.body.category)
        ? ctx.body.category
        : 'barber';
      const city = String(ctx.body.city || '').trim();
      const state = String(ctx.body.state || '').trim();

      db.prepare(
        `INSERT INTO pro_profiles
        (user_id, business_name, category, bio, city, state, price_min, price_max, years_experience, accent, initials)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        businessName || name,
        category,
        '',
        city,
        state,
        0,
        0,
        0,
        'violet',
        initialsFrom(businessName || name)
      );
    }

    const token = createSession(userId);
    setSessionCookie(ctx.res, token);

    redirect(
      ctx.res,
      role === 'pro' ? '/dashboard/pro' : '/dashboard/customer'
    );
  });

  router.post('/logout', async (ctx) => {
    const cookie = String(ctx.req.headers.cookie || '');
    const match = cookie.match(/(?:^|;\s*)gobookr_session=([^;]+)/);

    if (match) {
      destroySession(decodeURIComponent(match[1]));
    }

    clearSessionCookie(ctx.res);
    redirect(ctx.res, '/');
  });
};
