<script setup lang="ts">
import { darkTheme, NConfigProvider, NNotificationProvider, type GlobalThemeOverrides } from 'naive-ui'
import { RouterView, useRoute } from 'vue-router'
import { getCSSVar } from './util/getCSSVar'
import { computed, nextTick, onMounted, ref, watchEffect } from 'vue'
import { loadSettings, Settings, SETTINGS_STORAGE_KEY } from './settings'
import { NotifyProvider } from './notify'

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
  }
}

const naiveThemeOverrides = ref<GlobalThemeOverrides>(genNaiveTheme())

onMounted(() => {
  loadSettings()
})

watchEffect(async () => {
  if (Settings.lightMode) {
    document.documentElement.classList.add('light-mode')
  } else {
    document.documentElement.classList.remove('light-mode')
  }
  await nextTick()
  naiveThemeOverrides.value = genNaiveTheme()
})

watchEffect(() => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(Settings))
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
      </NotifyProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style>
@import url('@/assets/notify.scss');
</style>
