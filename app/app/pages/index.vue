<script setup lang="ts">
const { data: workspace, error } = await useFetch("/api/workspaces");

if (error.value) {
  console.error("Failed to get workspace:", error.value);
} else if (workspace.value) {
  await navigateTo(`/workspaces/${workspace.value.id}`);
}
</script>

<template>Redirecting...</template>
