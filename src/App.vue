<script setup lang="ts">
import { darkTheme, NConfigProvider, NNotificationProvider, type GlobalThemeOverrides } from 'naive-ui'
import { RouterView, useRoute } from 'vue-router'
import { getCSSVar } from '@/util/getCSSVar'
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { loadSettings, Settings, SETTINGS_STORAGE_KEY } from '@/settings'
import { assets } from '@/delta_providers/loader'
import { NotifyProvider } from '@/notify'
import Splash from '@/components/Splash.vue'
import { hasMonacoLoaded } from './monaco/monacoLoad'

const route = useRoute()

const routerViewKey = computed(() => {
  if (route.name === 'delta') {
    return route.path
  }

  return route.name
})

function genNaiveTheme(): GlobalThemeOverrides {
  return {
    common: {
      primaryColor: getCSSVar('--color-accent'),
      primaryColorHover: getCSSVar('--color-accent-hover'),
      primaryColorPressed: getCSSVar('--color-accent-pressed'),
      primaryColorSuppl: getCSSVar('--color-accent-suppl'),
      inputColor: getCSSVar('--color-0'),
      textColorBase: getCSSVar('--color-5'),
      textColor1: getCSSVar('--color-4'),
      textColor2: getCSSVar('--color-5'),
      textColor3: getCSSVar('--color-6'),
      fontWeight: '500',
      fontSize: '16px',
    },
    Button: {
      textColorPrimary: getCSSVar('--color-6'),
    },
    Input: {
      border: '1px solid var(--color-2)',
    },
    Split: {
      resizableTriggerColor: 'color-mix(in oklch, var(--color-1), var(--color-2))',
      resizableTriggerColorHover: 'var(--color-accent)',
    },
    Notification: {
      color: 'var(--color-1)',
      iconColor: 'var(--color-4)',
      iconColorInfo: 'color-mix(in srgb, var(--color-accent) 75%, var(--color-1))',
      iconColorWarning: 'color-mix(in srgb, var(--color-alert) 60%, var(--color-1))',
      iconColorError: 'color-mix(in srgb, var(--color-danger) 75%, var(--color-1))',
      iconColorSuccess: 'color-mix(in srgb, var(--color-success) 60%, var(--color-1))',
      headerTextColor: 'var(--color-6)',
      closeMargin: '0 calc(-1 * var(--notify-border-width)) 0 0',
      padding: '0 0 16px 0',
      width: 'fit-content',
    },
    Skeleton: {
      color: getCSSVar('--color-2'),
      colorEnd: getCSSVar('--color-3'),
    },
    InternalSelectMenu: {
      color: getCSSVar('--color-1'),
      borderRadius: '6px',
      optionColorActive: getCSSVar('--color-2'),
      optionColorPending: getCSSVar('--color-2'),
      optionColorActivePending: getCSSVar('--color-2'),
      optionTextColorActive: getCSSVar('--color-6'),
    },
    Upload: {
      draggerColor: getCSSVar('--color-0'),
      draggerBorder: '1px dashed var(--color-3)',
    },
    Checkbox: {
      labelFontWeight: 500,
      border: '1px solid var(--color-4)',
      checkMarkColor: '#fff',
    },
    Switch: {
      railColor: getCSSVar('--color-2'),
    },
  }
}

const naiveThemeOverrides = ref<GlobalThemeOverrides>(genNaiveTheme())

let loadedSettings = false
onMounted(async () => {
  loadSettings()
  loadedSettings = true
  assets()

  Object.defineProperty(globalThis, 'toggleCopyStatusButton', {
    value: () => {
      Settings.enableCopyStatusButton = !Settings.enableCopyStatusButton
    }
  })
})

watchEffect(async () => {
  switch (Settings.colorScheme) {
    case 'light':
      document.documentElement.classList.add('light-color-scheme')
      document.documentElement.classList.remove('oled-dark-color-scheme')
      break
    case 'oled-dark':
      document.documentElement.classList.remove('light-color-scheme')
      document.documentElement.classList.add('oled-dark-color-scheme')
      break
    default:
      document.documentElement.classList.remove('light-color-scheme')
      document.documentElement.classList.remove('oled-dark-color-scheme')
      break
  }
  await nextTick()
  naiveThemeOverrides.value = genNaiveTheme()
  if (hasMonacoLoaded.value) {
    ;(await import('@/monaco/monacoSetup')).updateMonacoTheme()
  }
})

watch(Settings, () => {
  if (loadedSettings) {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(Settings))
  }
})
</script>

<template>
  <NConfigProvider
    :theme="darkTheme"
    :theme-overrides="naiveThemeOverrides"
  >
    <NNotificationProvider placement="bottom-right">
      <NotifyProvider>
        <RouterView :key="routerViewKey"/>
        <Splash v-if="!Settings.eulaAccepted" />
      </NotifyProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style>
@import url('@/assets/notify.scss');
</style>
