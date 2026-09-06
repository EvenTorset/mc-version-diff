<script setup lang="ts">
import { generateMoveScript, generateMoveCommand } from '@/util/moveScriptGen'
import { NButton, NRadio, NRadioGroup } from 'naive-ui'
import { computed } from 'vue'
import TextView from './TextView.vue'
import type { DeltaResult } from '@/delta_providers/index.ts'
import { DeltaTrackState } from '@/delta_providers/states.ts'
import Row from './Row.vue'
import { copyToClipboard } from '@/util/clipboard.ts'
import { saveAs } from 'file-saver'
import Notify from '@/notify.tsx'
import { errorMessage } from '@/util/errorMessage.ts'
import { Settings } from '@/settings.ts'

const props = defineProps<{
  dr: DeltaResult
}>()

const text = computed(() => {
  const tracks = props.dr.tracks.filter(t => t.state === DeltaTrackState.Moved)
  if (Settings.chosenExecType === 'command') {
    return generateMoveCommand(tracks, Settings.chosenShell)
  }
  return generateMoveScript(tracks, Settings.chosenShell)
})

function download() {
  saveAs(new Blob([new TextEncoder().encode(text.value)]), `move_files.${
    Settings.chosenShell === 'cmd' ? 'bat'
    : Settings.chosenShell === 'powershell' ? 'ps1'
    : 'sh'
  }`)
}

async function copy() {
  try {
    await copyToClipboard(new TextEncoder().encode(text.value), 'text/plain')
    Notify.success({
      content: 'Copied!',
      duration: 1000,
    })
  } catch (err) {
    console.error(err)
    Notify.error(errorMessage(err))
  }
}
</script>

<template>
  <div class="delta-page-content">
    <h2>Move Script Generator</h2>
    <p>This tool generates a script or command line that you can run from a data/resource pack's root directory to easily move all of the files that need to be moved in order to update the pack.</p>
    <p>You can select different options below to read more about them.</p>
    <h3>Type</h3>
    <Row class="radio-row">
      <NRadioGroup v-model:value="Settings.chosenExecType">
        <NRadio value="script">Script</NRadio>
        <NRadio value="command">Command</NRadio>
      </NRadioGroup>
    </Row>
    <template v-if="Settings.chosenExecType === 'script'">
      <p>Scripts can be downloaded, placed into the root folder of a pack, and then double-clicked to run it. Once it is done, the script can be deleted.</p>
      <p>PowerShell scripts may need to be run from the right-click context menu instead.</p>
      <p>Scripts on Linux/macOS will need to be made executable first using the <code>chmod +x "file/path"</code> command.</p>
    </template>
    <p v-else>Commands can be copied to the clipboard and pasted into a terminal. Note that it must be run from the root directory of a pack.</p>
    <h3>{{ Settings.chosenExecType === 'script' ? 'Script' : 'Command' }} Format</h3>
    <Row class="radio-row">
      <NRadioGroup v-model:value="Settings.chosenShell">
        <NRadio value="cmd">Command Prompt</NRadio>
        <NRadio value="powershell">PowerShell</NRadio>
        <NRadio value="bash">Bash/Zsh</NRadio>
      </NRadioGroup>
    </Row>
    <template v-if="Settings.chosenShell === 'cmd'">
      <p>Command Prompt, also known as "CMD", is the classic Windows shell.</p>
      <p v-if="Settings.chosenExecType === 'command'">You can open it in any folder by typing <code>cmd</code> into the address bar while you have the folder open in File Explorer and then pressing Enter.</p>
    </template>
    <template v-else-if="Settings.chosenShell === 'powershell'">
      <p>PowerShell is the modern Windows shell, the default since Windows 10.</p>
      <p v-if="Settings.chosenExecType === 'command'">You can open it in any folder by typing <code>powershell</code> (or <code>pwsh</code> for PowerShell 6+) into the address bar while you have the folder open in File Explorer and then pressing Enter.</p>
    </template>
    <template v-else>
      <p>Bash is the default shell on a lot of Linux distros. Zsh is the default on macOS.</p>
      <template v-if="Settings.chosenExecType === 'command'">
        <p>On Linux, opening the terminal at a specific folder depends on your desktop environment, but there is commonly an option to open the terminal at a folder you right-click. If not, use the <code>cd "path/to/folder"</code> command.</p>
        <p>In Finder on macOS, you can right-click a folder and choose Services > New Terminal at Folder. It may require a setting to be enabled to show up.</p>
      </template>
    </template>
    <h3>{{ Settings.chosenExecType === 'script' ? 'Script' : 'Command' }} Explanation</h3>
    <template v-if="Settings.chosenShell === 'bash' && Settings.chosenExecType === 'script'">
      <table class="explanation">
        <tr>
          <td><code>#!/usr/bin/env bash</code></td>
          <td>Specifies that the script should be executed using the Bash shell environment.</td>
        </tr>
        <tr>
          <td><code>if [ -f "old/path" ]; then</code></td>
          <td>Checks if the source file exists before trying to move it.</td>
        </tr>
        <tr>
          <td><code>mkdir -p "new/folder"</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>&&</code></td>
          <td>Makes the following command only run if the previous command finished successfully.</td>
        </tr>
        <tr>
          <td><code>mv "old" "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>2>/dev/null</code></td>
          <td>Suppresses error messages so missing files or minor issues are ignored silently.</td>
        </tr>
      </table>
    </template>
    <template v-if="Settings.chosenShell === 'bash' && Settings.chosenExecType === 'command'">
      <table class="explanation">
        <tr>
          <td><code>[ -f "old/path" ]</code></td>
          <td>Checks if the source file exists before trying to move it.</td>
        </tr>
        <tr>
          <td><code>&&</code></td>
          <td>Makes the following command only run if the previous command finished successfully.</td>
        </tr>
        <tr>
          <td><code>mkdir -p "new/folder"</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>mv "old" "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>2>/dev/null</code></td>
          <td>Suppresses error messages so missing files or minor issues are ignored silently.</td>
        </tr>
        <tr>
          <td><code>;</code></td>
          <td>Separates individual commands so multiple can be run from a single line.</td>
        </tr>
      </table>
    </template>
    <template v-if="Settings.chosenShell === 'powershell' && Settings.chosenExecType === 'script'">
      <table class="explanation">
        <tr>
          <td><code>if (Test-Path -LiteralPath "old\path")</code></td>
          <td>Checks if the source file exists before trying to move it.</td>
        </tr>
        <tr>
          <td><code>New-Item -ItemType Directory -Force -Path "new\folder"</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>| Out-Null</code></td>
          <td>Suppresses directory creation confirmation messages from printing to the console.</td>
        </tr>
        <tr>
          <td><code>Move-Item -LiteralPath "old" -Destination "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>-ErrorAction SilentlyContinue</code></td>
          <td>Suppresses error messages so missing files or minor issues are ignored silently.</td>
        </tr>
      </table>
    </template>
    <template v-if="Settings.chosenShell === 'powershell' && Settings.chosenExecType === 'command'">
      <table class="explanation">
        <tr>
          <td><code>if (Test-Path -LiteralPath "old\path")</code></td>
          <td>Checks if the source file exists before trying to move it.</td>
        </tr>
        <tr>
          <td><code>New-Item -ItemType Directory -Force -Path "new\folder"</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>| Out-Null</code></td>
          <td>Suppresses directory creation confirmation messages from printing to the console.</td>
        </tr>
        <tr>
          <td><code>Move-Item -LiteralPath "old" -Destination "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>-ErrorAction SilentlyContinue</code></td>
          <td>Suppresses error messages so missing files or minor issues are ignored silently.</td>
        </tr>
        <tr>
          <td><code>;</code></td>
          <td>Separates individual commands so multiple can be run from a single line.</td>
        </tr>
      </table>
    </template>
    <template v-if="Settings.chosenShell === 'cmd' && Settings.chosenExecType === 'script'">
      <table class="explanation">
        <tr>
          <td><code>@echo off</code></td>
          <td>Prevents Command Prompt from printing every line of the script to the screen while executing.</td>
        </tr>
        <tr>
          <td><code>mkdir "new\folder" 2>nul</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>&</code></td>
          <td>Separates individual commands so multiple can be run from a single line.</td>
        </tr>
        <tr>
          <td><code>move /Y "old" "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>>nul 2>&1</code></td>
          <td>Suppresses output and error messages so operations are completed silently.</td>
        </tr>
      </table>
    </template>
    <template v-if="Settings.chosenShell === 'cmd' && Settings.chosenExecType === 'command'">
      <table class="explanation">
        <tr>
          <td><code>mkdir "new\folder" 2>nul</code></td>
          <td>Creates the destination directory if it does not already exist.</td>
        </tr>
        <tr>
          <td><code>move /Y "old" "new"</code></td>
          <td>Moves the file from its source path to its destination path.</td>
        </tr>
        <tr>
          <td><code>>nul 2>&1</code></td>
          <td>Suppresses output and error messages so operations are completed silently.</td>
        </tr>
        <tr>
          <td><code>&</code></td>
          <td>Separates individual commands so multiple can be run from a single line.</td>
        </tr>
      </table>
    </template>
    <h3>{{ Settings.chosenExecType === 'script' ? 'Script' : 'Command' }}</h3>
    <NButton v-if="Settings.chosenExecType === 'script'" class="accent" @click="download">Download</NButton>
    <NButton v-if="Settings.chosenExecType === 'command'" class="accent" @click="copy">Copy</NButton>
    <div>
      <TextView :text :key="text" path="file.txt"/>
    </div>
  </div>
</template>

<style lang="scss" scoped>

code {
  background-color: var(--color-1);
  padding: 0 2px;
  margin: 0 -1px;
  border: 1px solid var(--color-2);
  border-radius: 3px;
}

.radio-row {
  margin-left: -8px;
  padding-top: 4px;
}

.explanation {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 8px;
  counter-reset: explanation;

  tr {
    counter-increment: explanation;
  }

  td:first-child::before {
    content: counter(explanation);
    display: inline-block;
    width: 1.5em;
    margin-right: 12px;
    text-align: right;
    color: var(--color-3);
    user-select: none;
  }

  td {
    padding: 7px 0;
    vertical-align: top;
    border-top: 1px solid var(--color-2);
  }

  tr:first-child td {
    border-top: none;
  }

  td:first-child {
    width: 1%;
    padding-right: 24px;
    white-space: nowrap;
    color: var(--color-6);
  }

  code {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
  }
}

@media (max-width: 700px) {
  .explanation td:first-child {
    white-space: normal;
  }
}

.delta-page-content {
  --delta-page-content-width: 900px;

  width: 100%;
  max-width: var(--delta-page-content-width);
  margin-inline: auto;
  padding: 60px 0 40px;
}

@media (min-width: 1700px) {
  .delta-page-content {
    margin-right: auto;
    margin-left: max(0px, calc(
      50% - var(--sidebar-width) / 2 - var(--delta-page-content-width) / 2 + var(--content-gutter) / 2
    ));
  }
}

</style>
