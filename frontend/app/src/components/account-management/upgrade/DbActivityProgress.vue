<script setup lang="ts">
import { type CurrentDbUpgradeProgress } from '@/types/login';

const props = withDefaults(
  defineProps<{
    progress: CurrentDbUpgradeProgress | null;
    dataMigration?: boolean;
  }>(),
  {
    dataMigration: false
  }
);

const { t } = useI18n();

const { progress } = toRefs(props);

const multipleUpgrades = computed(() => {
  if (isDefined(progress)) {
    const { toVersion, fromVersion } = get(progress);
    return toVersion - fromVersion > 1;
  }
  return false;
});
</script>

<template>
  <Card v-if="progress" flat>
    <template #title>
      <span v-if="dataMigration">{{ t('login.migrating_data.title') }} </span>
      <span v-else> {{ t('login.upgrading_db.title') }}</span>
    </template>
    <VRow class="my-2">
      <VCol cols="auto">
        <div class="mr-2">
          <VProgressCircular
            rounded
            :value="progress.percentage"
            size="45"
            width="4"
            color="primary"
          >
            <div v-if="multipleUpgrades">
              <VProgressCircular
                :value="progress.totalPercentage"
                color="primary"
              />
            </div>
          </VProgressCircular>
        </div>
      </VCol>
      <VCol class="text-body-1">
        <div v-if="!dataMigration">
          <div>
            {{ t('login.upgrading_db.warning', { ...progress }) }}
          </div>
          <VDivider class="my-2" />
          <div>
            {{ t('login.upgrading_db.current', { ...progress }) }}
          </div>
        </div>
        <div v-else>
          <div>
            {{ t('login.migrating_data.warning', { ...progress }) }}
          </div>
          <VDivider class="my-2" />
          <div>
            {{ t('login.migrating_data.current', { ...progress }) }}
          </div>
          <ul v-if="progress.description" class="ml-n2">
            <li>{{ progress.description }}</li>
          </ul>
        </div>
      </VCol>
    </VRow>
  </Card>
</template>
