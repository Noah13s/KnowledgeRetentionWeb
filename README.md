# Knowledge Retention

A Capacitor-enabled React application for managing quiz categories, image libraries, and an on-device AI grading workflow.

## Overview

This project is built with:
- React 19 + TypeScript
- Vite 8
- Capacitor 8 for native Android integration
- llama-cpp-capacitor for local LLM inference
- @capacitor/filesystem for managing external storage
- @capgo/capacitor-social-login for Google Drive backup/import

The app includes:
- AI Grader: download a local model, load it on device, and grade free-text quiz answers.
- Image Library: browse external image folders, import photos, create folders, rename/delete assets, and export/import data.
- Category Editor: organize quiz categories and quizzes in external storage for offline learning.

## Getting Started

### Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- Android SDK if building for Android

### Install dependencies

```bash
npm install
```

### Run the app in development

```bash
npm run dev
```

Then open the local URL shown in your terminal.

### Build for production

```bash
npm run build
```

### Sync Capacitor and run on Android

```bash
npx cap sync
npx cap run android
```

## Project Structure

- `src/App.tsx` - application routing and bottom navigation
- `src/pages/main/AiSettingsPage.tsx` - local model download, load/unload, and grading UI
- `src/pages/main/ImageLibrary.tsx` - external image browsing, import, and Google Drive backup
- `src/pages/main/CategoryEditor.tsx` - category and quiz management UI
- `src/lib/localLlm.ts` - local LLM integration with llama-cpp-capacitor
- `capacitor.config.ts` - Capacitor application configuration

## Notes

- The local model is not bundled with the app. Download it from the AI settings page before grading quizzes.
- Google Drive backup requires signing in with the configured Google OAuth client.
- External files are stored using Capacitor's `Filesystem` API under the device's external storage directory.

## Useful commands

```bash
npm run dev
npm run build
npx cap sync
npx cap run android
```

## License

## License

This repository currently has no license file. Add one if you want to publish or share this project more broadly. Recommended: add an OSI-approved license such as MIT or Apache-2.0.

## Contributing

Contributions are welcome — please follow these steps to contribute:

1. Fork the repository and create a branch named `feature/your-feature`.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev` and verify your changes.
4. Open a pull request with a clear description of the problem and the changes made.

Please follow existing code style and add tests for significant changes when possible.

## Author & Contact

- Author: Noah (Noah13s)
- Repository: https://github.com/Noah13s/KnowledgeRetentionWeb


