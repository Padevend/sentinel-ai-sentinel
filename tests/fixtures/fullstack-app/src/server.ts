import express from 'express';
import { validateUserRegistration } from './validator.js';

export const app = express();
app.use(express.json());

const users: Array<{ id: string; name: string; email: string }> = [];

// POST /api/users - Register new user
app.post('/api/users', (req, res) => {
  const validation = validateUserRegistration(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }

  const user = {
    id: `user-${Date.now()}`,
    name: req.body.name,
    email: req.body.email,
  };

  users.push(user);
  return res.status(201).json({ success: true, user });
});

// GET /api/users
app.get('/api/users', (_req, res) => {
  return res.json({ users });
});
