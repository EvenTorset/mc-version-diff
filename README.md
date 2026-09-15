# Version Diff

A web-based asset and data comparison tool built for Minecraft resource pack creators, data pack authors, and modders.

Compare any two versions of Minecraft side by side. Instantly preview changes across textures, models, sounds, recipes, structures, and more.

Works on Java Edition, Bedrock Edition, and resource or data packs you upload yourself.

You can use [Version Diff online](https://cccode.pages.dev/version-diff/). Unlike official changelogs that only give a high-level overview, it shows you the exact files that were added, modified, moved, or removed between updates.

> [!NOTE]
> All comparisons are processed entirely in your browser. Uploaded files are never sent to a server.

## Key Features

- **Version Comparison:** Pick any two Minecraft versions (releases or snapshots) to generate a detailed breakdown of all asset and data changes.
- **Custom Upload Comparison:** Upload two custom `.zip` or `.jar` files to compare asset differences directly between resource packs, data packs, or mods.
- **Asset & Data Inspection:**
  - **Textures:** Visual side-by-side comparison of textures, with options to toggle specific color channels and preview animations.
  - **Models:** Interactive 3D previews of block and item models.
  - **Structures:** 3D inspection and highlighted changes for structure files.
  - **Localization:** String diffs highlighting changed words and punctuation, grouped into added, edited, and removed entries.
  - **Sounds**: Changed sound files can be listened to and the differences in their waveforms are highlighted. Sound events can play the sounds with their pitch and volume modifiers.
  - **Data Files:** Detailed loot table stats, visual recipe previews, and more.

## Local Development

### Prerequisites
- Node.js (v24 or higher)
- npm or a similar package manager

### Setup
1. Clone the repository:
    ```sh
    git clone https://github.com/EvenTorset/mc-version-diff.git
    ```
2. Navigate to the cloned project directory:
    ```sh
    cd mc-version-diff
    ```
3. Install dependencies:
    ```sh
    npm install
    ```
4. Start the local server:
    ```sh
    npm run dev
    ```

## Disclaimer

NOT AN OFFICIAL MINECRAFT WEBSITE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
