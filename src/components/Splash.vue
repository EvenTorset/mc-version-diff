<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NCard, NCheckbox } from 'naive-ui'
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import SiteDisclaimer from '@/components/SiteDisclaimer.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import { acceptEula, EULA_URL } from '@/util/eula'

const agreed = ref(false)
</script>

<template>
  <div class="splash">
    <Col class="splash-inner" align="stretch" gap="50px">
      <Row justify="center" gap="20px">
        <VersionDiffLogo />
      </Row>

      <Col class="about" gap="12px">
        <p>
          Compare any two versions of Minecraft, side by side. Every texture, model, sound, structure,
          language file and recipe that changed between them, each one previewable in place.
        </p>
        <p>
          Works on Java Edition, Bedrock Edition, the assets Java downloads outside the game jar, and
          resource packs you upload yourself.
        </p>
      </Col>

      <Col align="stretch" gap="16px">
        <NCard title="Minecraft EULA">
          <Col gap="14px" align="stretch">
            <p>
              This site shows assets from Minecraft. To continue, you need to agree to the
              <a :href="EULA_URL" target="_blank" rel="noopener">Minecraft End User License Agreement</a>.
            </p>

            <Row justify="space-between" align="flex-end" gap="16px">
              <NCheckbox v-model:checked="agreed" class="terms">
                I have read the End User License Agreement and I agree to its terms
              </NCheckbox>
              <NButton class="accent" :disabled="!agreed" style="flex: 0 0 auto;" @click="acceptEula()">Continue</NButton>
            </Row>
          </Col>
        </NCard>

        <SiteDisclaimer />
      </Col>
    </Col>
  </div>
</template>

<style scoped>

.splash {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: safe center;
  justify-content: center;
  overflow-y: auto;
  padding: 40px 20px;
  box-sizing: border-box;
  background-color: var(--color-0);
}

.splash-inner {
  width: 100%;
  max-width: 580px;
}

p {
  margin: 0;
  color: var(--color-5);
  font-size: 14px;
  line-height: 1.6;
  text-wrap: pretty;
}

.about {
  padding: 0 4px;
}

.about p {
  text-align: center;
}

.terms {
  margin-left: -8px;
  align-items: flex-start;
}

a {
  color: var(--color-accent);
  text-decoration: underline;
}

</style>
