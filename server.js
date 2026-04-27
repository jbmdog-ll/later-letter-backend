const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ── ENV VARS (set these in Railway) ──────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAILGUN_WEBHOOK_KEY = process.env.MAILGUN_WEBHOOK_KEY;
const PORT = process.env.PORT || 3000;

// ── SUPABASE CLIENT (service role — backend only) ─────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── HEALTH CHECK ──────────────────────────────────────────────────
// Visit https://your-app.railway.app/ to confirm the server is running
app.get('/', (req, res) => {
  res.json({ status: 'Later Letters backend is running 💙' });
});

// ── INBOUND EMAIL FROM MAILGUN ────────────────────────────────────
// Mailgun POST's here whenever someone emails an address at your domain
// e.g. emma@yourdomain.com  →  Mailgun  →  POST /inbound
app.post('/inbound', upload.any(), async (req, res) => {
  try {
    const body = req.body;

    // Who the email was sent TO e.g. "emma@yourdomain.com"
    const recipient = body.recipient || body.To || '';
    // Extract the slug before the @ e.g. "emma"
    const emailSlug = recipient.split('@')[0].toLowerCase().trim();

    // Who sent the email
    const from = body.sender || body.from || body.From || 'Unknown';
    const fromName = from.replace(/<.*>/, '').trim() || from;

    // Email subject becomes the letter title
    const subject = body.subject || body.Subject || 'A memory for you';

    // Email body becomes the letter content
    // Mailgun sends both plain text and HTML — we prefer plain text
    const text = body['body-plain'] || body['stripped-text'] || body.text || '';
    const letterBody = text.trim();

    // Look up which user owns this email slug
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('user_id, name')
      .eq('email_slug', emailSlug)
      .single();

    if (personError || !person) {
      console.log(`No person found for slug: ${emailSlug}`);
      // Still return 200 so Mailgun doesn't keep retrying
      return res.status(200).json({ message: 'No matching person found' });
    }

    // Build the letter object
    const letter = {
      user_id: person.user_id,
      recipient: person.name,
      title: subject,
      body: letterBody,
      category: 'letter',
      emoji: '💌',
      photos: [],
      audio_recs: [],
      video_recs: [],
      locked: false,
      pin: '',
      timed: false,
      open_date: null,
    };

    // Save it to Supabase
    const { error: insertError } = await supabase
      .from('letters')
      .insert(letter);

    if (insertError) {
      console.error('Error saving letter:', insertError);
      return res.status(500).json({ error: 'Failed to save letter' });
    }

    console.log(`✓ Letter saved for ${person.name} from ${fromName}`);
    res.status(200).json({ message: 'Letter saved successfully' });

  } catch (err) {
    console.error('Inbound email error:', err);
    // Always return 200 to Mailgun so it doesn't retry endlessly
    res.status(200).json({ error: err.message });
  }
});

// ── GET ALL LETTERS FOR A USER ────────────────────────────────────
// Called by the frontend to load all letters for the logged-in user
app.get('/letters', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    // Verify the user's session token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: letters, error } = await supabase
      .from('letters')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ letters });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SAVE A NEW LETTER ─────────────────────────────────────────────
// Called when user clicks "Save this letter" in the app
app.post('/letters', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const letter = {
      user_id: user.id,
      recipient: req.body.recipient || 'My loved one',
      title: req.body.title,
      body: req.body.body || '',
      category: req.body.category || 'letter',
      emoji: req.body.emoji || '',
      photos: req.body.photos || [],
      audio_recs: req.body.audioRecs || [],
      video_recs: req.body.videoRecs || [],
      locked: req.body.locked || false,
      pin: req.body.pin || '',
      timed: req.body.timed || false,
      open_date: req.body.openDate || null,
    };

    const { data, error } = await supabase
      .from('letters')
      .insert(letter)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ letter: data });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE A LETTER ───────────────────────────────────────────────
app.delete('/letters/:id', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { error } = await supabase
      .from('letters')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id); // Safety: only delete own letters

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Letter deleted' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ALL PEOPLE FOR A USER ─────────────────────────────────────
app.get('/people', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { data: people, error } = await supabase
      .from('people')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ people });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADD A NEW PERSON ──────────────────────────────────────────────
// When you add someone, they get a unique email address automatically
// e.g. name "Emma Smith" → emma-smith@yourdomain.com
app.post('/people', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const name = req.body.name?.trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Generate a unique email slug from the name
    // "Emma Smith" → "emma-smith", "My Son Jake" → "my-son-jake"
    let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check if slug already exists for this user — if so, add a number
    const { data: existing } = await supabase
      .from('people')
      .select('email_slug')
      .eq('user_id', user.id)
      .eq('email_slug', slug);

    if (existing && existing.length > 0) {
      slug = slug + '-' + Date.now().toString().slice(-4);
    }

    const { data: person, error } = await supabase
      .from('people')
      .insert({ user_id: user.id, name, email_slug: slug })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ person });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE A PERSON ───────────────────────────────────────────────
app.delete('/people/:id', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    const { error } = await supabase
      .from('people')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Person deleted' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START SERVER ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Later Letters backend running on port ${PORT} 💙`);
});
