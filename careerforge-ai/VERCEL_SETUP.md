# Vercel Environment Variable Setup

## Problem
The deployed application on Vercel is not working because the `GEMINI_API_KEY` environment variable is not configured.

## Solution

### Method 1: Vercel Dashboard (Easiest)

1. **Get a New Gemini API Key:**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account
   - Click "Create API Key" or "Get API Key"
   - Copy the new API key

2. **Configure in Vercel:**
   - Go to: https://vercel.com/dashboard
   - Select your `careerforge-ai` project
   - Click **Settings** → **Environment Variables**
   - Add new variable:
     - **Name**: `GEMINI_API_KEY`
     - **Value**: [Your new API key]
     - **Environments**: Check all (Production, Preview, Development)
   - Click **Save**

3. **Redeploy:**
   - Go to **Deployments** tab
   - Click ⋯ (three dots) on latest deployment
   - Click **Redeploy**
   - Wait for deployment to complete

### Method 2: Vercel CLI

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variable
vercel env add GEMINI_API_KEY

# When prompted:
# - Enter your API key value
# - Select all environments (Production, Preview, Development)

# Redeploy
vercel --prod
```

## Verification

After redeploying, test your application at:
https://careerforge-ai-pied.vercel.app

The AI features should now work properly!

## Important Notes

- ⚠️ Never commit API keys to your repository
- ✅ Always use environment variables for sensitive data
- ✅ The `.env` file is only for local development
- ✅ Vercel environment variables are separate from your local `.env` file
