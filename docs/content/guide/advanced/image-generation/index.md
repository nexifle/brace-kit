+++
title = "Image Generation"
description = "Generate images directly in chat with Gemini or xAI models."
weight = 44
template = "page.html"

[extra]
category = "Advanced"
+++

# Image Generation

Generate images directly in your conversation using Gemini or xAI models. Describe what you want, and the AI creates it.

## Supported Models

| Provider | Model | Notes |
|----------|-------|-------|
| **Google** | gemini-2.5-flash-image | Fast image generation |
| **Google** | gemini-3-pro-image-preview | Preview model |
| **xAI** | grok-2-image-1212 | xAI image generation |
| **xAI** | grok-imagine-image | Standard quality |
| **xAI** | grok-imagine-image-pro | Higher quality |

## Quick Start

### 1. Select an Image Model

1. Click the provider selector in the toolbar
2. Choose **Gemini** or **xAI**
3. Select an image generation model

### 2. Choose Aspect Ratio

Click the aspect ratio selector in the toolbar:

| Ratio | Best For |
|-------|----------|
| 1:1 | Profile pictures, icons |
| 16:9 | Banners, presentations |
| 9:16 | Stories, mobile wallpapers |
| 4:3 | Standard photos |
| 3:4 | Portraits |
| 3:2 | Photography |
| 2:3 | Portrait photography |
| 4:5 | Instagram posts |
| 5:4 | Landscape orientation |
| 21:9 | Ultrawide, cinematic |

> **Note:** Gemini doesn't support "auto" aspect ratio. Select a specific ratio. xAI offers "auto" which lets the model choose.

### 3. Describe Your Image

Type a description and send:

```
You: Generate a minimalist logo for a coffee shop called "Morning Brew"
```

The image appears in the response.

## Tips for Better Images

### Be Specific

```
❌ "A cat"
✅ "A fluffy orange tabby cat sitting on a windowsill, soft morning light, photorealistic"
```

### Include Style

```
✅ "in the style of Studio Ghibli"
✅ "minimalist line art"
✅ "photorealistic"
✅ "watercolor painting"
```

### Specify Details

- **Subject**: What's in the image
- **Setting**: Background, environment
- **Mood**: Bright, dark, dramatic, calm
- **Style**: Art style, medium
- **Colors**: Color palette

### Example Prompts

**Logo Design**
```
Minimalist logo for a tech startup, abstract geometric shape,
blue and white colors, clean modern design, vector style
```

**Illustration**
```
Cozy coffee shop interior, warm lighting, wooden furniture,
plants by the window, watercolor illustration style
```

**Photo-Style**
```
Mountain landscape at sunset, golden hour lighting,
dramatic clouds, photorealistic, wide angle
```

**Character**
```
Cute robot character, round design, friendly expression,
holding a coffee cup, Pixar animation style
```

## Viewing Generated Images

### In Chat

Generated images appear inline in the conversation.

### Lightbox

Click an image to open the lightbox:
- Full-size view
- Navigate between images
- Download
- Copy to clipboard
- Jump to source conversation

### Gallery

All generated images are saved to the Gallery:
- Browse all images
- Favorite best ones
- View by conversation

## Using Images

### Copy to Clipboard

1. Click the image to open lightbox
2. Click the copy button
3. Paste anywhere

### Download

1. Click the image
2. Click the download button
3. Save to your computer

### Share

Copy the image and share in:
- Documents
- Presentations
- Social media
- Messages

## Limitations

### Content Policy

Both providers have content policies:
- No explicit content
- No copyrighted characters
- No harmful imagery

If a prompt violates policy, you'll see an error.

### Quality Varies

- Simple prompts → unpredictable results
- Detailed prompts → more consistent
- Multiple attempts may be needed

### Rate Limits

Check your provider's documentation for current rate limits.

## Troubleshooting

### "Image generation failed"

- Try a simpler prompt
- Check content policy compliance
- Verify API key has access

### Images look wrong

- Add more detail to prompt
- Specify style explicitly
- Try different aspect ratio

### Slow generation

- Image generation takes 10-30 seconds
- Complex prompts take longer
- Check network connection

### Model not available

- Ensure you're using the correct model
- Check provider status
- Verify API key permissions

## Gallery Integration

Generated images automatically appear in the Gallery:

1. Open Gallery from header
2. View all images including generated ones
3. Favorite, copy, or download

→ **[Gallery guide](/guide/advanced/gallery/)**

## Related

- [Gallery View](/guide/advanced/gallery/) — Browse all images
- [Gemini](/guide/ai-providers/gemini/) — Google provider setup
- [xAI](/guide/ai-providers/xai/) — xAI provider setup
