<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NCard, NCheckbox } from 'naive-ui'
import Col from '@/components/Col.vue'
import Row from '@/components/Row.vue'
import SiteDisclaimer from '@/components/SiteDisclaimer.vue'
import VersionDiffLogo from '@/components/VersionDiffLogo.vue'
import { EULA_URL } from '@/util/eula'
import { Settings } from '@/settings'

const agreed = ref(false)
</script>

<template>
  <div class="splash">
    <Col class="splash-inner" align="stretch" gap="50px">
      <Row justify="center" gap="20px">
        <VersionDiffLogo />
      </Row>

      <p class="about">
        Compare any two versions of Minecraft side by side. Instantly preview changes across textures, models, sounds, recipes, structures, and more.
        <br>
        <br>
        Works on Java Edition, Bedrock Edition, and resource or data packs you upload yourself.
      </p>

      <Col align="stretch" gap="16px">
        <NCard title="Minecraft EULA">
          <Col gap="14px" align="stretch">
            <p>
              This site shows assets from Minecraft. To continue, you need to agree to the
              <a :href="EULA_URL" target="_blank" rel="noopener">Minecraft End User License Agreement (EULA)</a>.
            </p>

            <Row justify="space-between" gap="16px">
              <NCheckbox v-model:checked="agreed" class="terms">
                I have read the EULA and I agree to its terms
              </NCheckbox>
              <NButton
                class="accent"
                :disabled="!agreed"
                style="flex: 0 0 auto;"
                @click="Settings.eulaAccepted = true"
              >Continue</NButton>
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
  text-wrap: balance;
  text-align: center;
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

  &:hover {
    color: var(--color-accent-suppl);
  }
}

</style>
