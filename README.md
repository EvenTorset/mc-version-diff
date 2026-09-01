# Minecraft Version Diff

A web-based asset and data comparison tool built for Minecraft resource pack creators, data pack authors, and modders.

The [Minecraft Version Diff comparison tool](https://cccode.pages.dev/version-diff/) lets you inspect exact asset changes across different Minecraft versions, user-uploaded resource packs, data packs, and mods. It highlights what was added, edited, moved, or removed, covering far more detail than official changelogs.

**Privacy Note:** All comparisons are processed entirely in your browser. Uploaded files are never sent to a server.

## Key Features

- **Version Comparison:** Pick any two Minecraft versions (releases or snapshots) to generate a detailed breakdown of all asset and data changes.
- **Custom Upload Comparison:** Upload two custom `.zip`, `.mcpack`, or `.jar` files to compare asset differences directly between resource packs, data packs, or mods.
- **Asset & Data Inspection:**
  - **Textures:** Visual side-by-side comparison of textures, with options to toggle specific color channels and preview animations.
  - **Models:** Interactive 3D previews of block and item models.
  - **Structures:** 3D inspection and highlighted changes for structure files.
  - **Localization:** String diffs highlighting changed words and punctuation, grouped into added, edited, and removed entries.
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
