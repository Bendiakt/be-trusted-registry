# Railway Deployment Guide (MyDD)

## 1) Backend service
- Create a new Railway service from this repo.
- Set Root Directory to `backend`.
- Build command: `npm install`
- Start command: `npm start`

Backend environment variables:
- `PORT=5000`
- `JWT_SECRET=<strong-random-secret>`
- `STRIPE_SECRET_KEY=<your-stripe-secret-key>`
- `STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>`
- `FRONTEND_URL=<frontend-public-url>`

Health check:
- Path: `/api/health`

## 2) Frontend service
- Create another Railway service from the same repo.
- Set Root Directory to `frontend`.
- Build command: `npm install && npm run build`
- Start command: `npm start`

Frontend environment variables:
- `VITE_API_URL=<backend-public-url>`

## 3) Deploy order
1. Deploy backend and copy backend public URL.
2. Set `VITE_API_URL` in frontend service.
3. Deploy frontend and copy frontend public URL.
4. Set `FRONTEND_URL` in backend service to frontend URL.
5. Redeploy backend once.

## 4) Smoke tests
- Backend health: `GET /api/health` returns `{\"status\":\"ok\"}`.
- Frontend loads without blank screen.
- Register + Login works.
- Verify page works on `/verify/:id`.
- Checkout endpoint returns Stripe URL when authenticated.
