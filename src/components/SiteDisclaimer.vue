<script setup lang="ts">
import { DISCLAIMER } from '@/util/eula'
</script>

<template>
  <p class="site-disclaimer">{{ DISCLAIMER }}</p>
</template>

<style scoped>

.site-disclaimer {
  margin: 0;
  color: var(--color-dim);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.5;
  text-align: center;
  text-wrap: balance;
}

</style>
