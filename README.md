# EZDown - Universal Media Downloader

Welcome to **EZDown**, a powerful and versatile media downloader that works seamlessly with your favorite websites. Designed as a modern desktop application with an accompanying browser extension, EZDown makes downloading video and audio easier than ever. 

It acts as an intelligent wrapper around tools like `yt-dlp` and `FFmpeg` while offering a user-friendly UI and browser integration for a frictionless downloading experience.

---

## 🚀 Features

- **Universal Downloading:** Download videos, audio, and playlists from thousands of supported websites.
- **Browser Extension Integration:** Features a robust browser extension that detects watch pages and automatically injects a download button alongside native player interfaces.
- **Audio Streaming Backend:** Acts as a backend streamer with dynamic port discovery, enabling robust low-latency streams for quick audio playback!
- **High-Quality Merging:** Forcefully utilizes FFmpeg to merge downloaded audio and video streams into single, high-quality media files without extra effort.
- **Native Experience:** Built with Electron, it offers a desktop-first experience with a custom UI, background execution, and system tray integration.
- **Onboarding Wizard** to help newly installed users configure preferences natively.

## 🛠️ Built With

This project was built using a combination of powerful modern tools and technologies:

- **[Electron](https://www.electronjs.org/)** - For the native desktop application wrapping.
- **[Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)** - For the background local API handling dynamic downloading and streaming.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - The core CLI engine that powers media extraction.
- **[FFmpeg](https://ffmpeg.org/)** - For media conversion, transcoding, and merging formats reliably.
- **[electron-builder](https://www.electron.build/)** - For packaging and distributing as a standalone Windows `.exe` installer.

## 📋 Prerequisites

To run or build EZDown from the source, you'll need the following installed on your machine:
- **[Node.js](https://nodejs.org/en/)** (v18 or higher recommended)
- **npm** (comes bundled with Node.js)
- **Windows OS** (Currently supported packaging format)

*Note: The project bundles its own `yt-dlp.exe` and `ffmpeg.exe` for convenience, so you don't have to install them globally!*

## 💻 Installation & Setup

If you want to run the application in a development environment, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ops-com/open-EZDown.git
   cd EZDown
   ```

2. **Install the dependencies:**
   ```bash
   npm install
   ```

3. **Run the App Locally:**
   ```bash
   npm run app
   ```
   *(This will launch the electron app locally).*

4. **Run Backend Server Only (Development):**
   ```bash
   npm run start
   ```

## 📦 Packaging for Production

If you want to create a standalone, easy-to-install `.exe` for distribution:

1. Let `electron-builder` handle the packaging logic:
   ```bash
   npm run dist
   ```

2. Once completed, your executable will be located in the `dist` folder. Simply run the installer, and it will set up desktop shortcuts and necessary configurations seamlessly.

## 🖱️ How to Use

### Desktop Application
1. Launch **EZDown** from your start menu or desktop shortcut.
2. The UI will guide you through pasting links manually or configuring your root download paths.
3. Click "Download" to fetch the media!

### Browser Extension
1. Inside the app directory, navigate to the `/extension` folder.
2. Load the extension unpackaged into your browser:
   - For **Chrome/Edge**: Go to `chrome://extensions`, turn on **Developer mode**, and select **Load unpacked** pointing to the `extension` folder.
3. Navigate to a supported streaming site (like YouTube). 
4. The extension will highlight and add a download interaction natively on the streaming page.
5. All downloads requested from the extension will automatically route through your background EZDown application.

## 🌐 Supported Sites

EZDown supports thousands of hostings. For a complete list of sites supported out-of-the-box by the yt-dlp core, see the documentation inside:
[⚙️ `supportedsites.md`](supportedsites.md)

## 🤝 How to Contribute

We welcome contributions to make EZDown even better! Here's how you can help:

1. **Fork the repository** on GitHub.
2. **Create a feature branch** (`git checkout -b feature/AmazingNewFeature`).
3. **Commit your changes** (`git commit -m 'Add some AmazingNewFeature'`).
4. **Push to the branch** (`git push origin feature/AmazingNewFeature`).
5. **Open a Pull Request** describing your changes and intentions!

Feel free to open issues if you notice a bug, or have a stellar feature request.

---

## 💖 Support the Project (Donate)

EZDown is built and maintained during our free time. If you enjoy using EZDown and it has saved you time downloading media, please consider supporting the project! 
Your donations help keep the development active, add new features, and ensure regular updates.

**☕ [Buy me a Coffee](https://ko-fi.com/opscom)**
**🪙 Crypto Wallet (BTC):** [Binance](https://app.binance.com/uni-qr/53UCq9d3)

Thank you for your support, and happy downloading! 🎉
#
