<script setup lang="ts">
const zip = ref<File | null>(null);
const importError = ref('');
const exportError = ref('');
const downloading = ref(false);
const downloaded = ref(false);
const uploading = ref(false);
const uploaded = ref(false);

const { importCustomAssets, exportCustomAssets } = useAssets();
const importDisabled = computed(() => !get(zip));
const { start, stop } = useTimeoutFn(() => set(downloaded, false), 4000);

const importZip = async () => {
  const file = get(zip);
  assert(file);
  set(uploading, true);
  const result = await importCustomAssets(file);
  if (result.success) {
    set(uploaded, true);
  } else {
    set(importError, result.message);
  }
  set(uploading, false);
  set(zip, null);
};

const exportZip = async () => {
  stop();
  if (get(downloading)) {
    return;
  }
  set(downloading, true);
  const result = await exportCustomAssets();
  if (result.success) {
    set(downloaded, true);
    start();
  } else {
    set(exportError, result.message);
  }
  set(downloading, false);
};

const { t } = useI18n();
</script>

<template>
  <Card>
    <template #title>{{ t('manage_user_assets.title') }}</template>

    <VAlert type="info" outlined dense>
      {{ t('manage_user_assets.warning') }}
    </VAlert>

    <VSheet outlined class="pa-4" rounded>
      <div class="text-h6">{{ t('manage_user_assets.export.title') }}</div>
      <div class="text-subtitle-1">
        {{ t('manage_user_assets.export.subtitle') }}
      </div>
      <VAlert v-if="exportError" type="error" outlined dense>
        {{ exportError }}
      </VAlert>
      <div class="d-flex flex-row align-center mt-4">
        <VBtn color="primary" :loading="downloading" @click="exportZip()">
          {{ t('manage_user_assets.export.button') }}
        </VBtn>
        <VIcon v-if="downloaded" class="ms-4" color="success">
          mdi-check-circle
        </VIcon>
        <span v-if="downloaded" class="ms-2">
          {{ t('manage_user_assets.export.success') }}
        </span>
      </div>
    </VSheet>

    <VSheet outlined class="pa-4 mt-4" rounded>
      <div class="text-h6">{{ t('common.actions.import') }}</div>
      <div class="text-subtitle-1">
        {{ t('manage_user_assets.import.subtitle') }}
      </div>
      <FileUpload
        class="mt-4"
        source="zip"
        file-filter=".zip"
        :uploaded="uploaded"
        :error-message="importError"
        @selected="zip = $event"
        @update:uploaded="uploaded = $event"
      />
      <VBtn
        color="primary"
        class="mt-4"
        :disabled="importDisabled"
        :loading="uploading"
        @click="importZip()"
      >
        {{ t('common.actions.import') }}
      </VBtn>
    </VSheet>
  </Card>
</template>
