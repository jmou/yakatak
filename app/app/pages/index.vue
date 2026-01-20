<script setup lang="ts">
const { data, error } = await useFetch("/api/workspaces");

if (error.value) {
  console.error("Failed to get workspaces:", error.value);
} else if (data.value) {
  let workspaceId: number;

  if (data.value.workspaces.length > 0) {
    // Use most recent workspace (first in list)
    workspaceId = data.value.workspaces[0]!.id;
  } else {
    // Create new workspace
    const newWorkspace = await $fetch("/api/workspaces", { method: "POST" });
    workspaceId = newWorkspace.id;
  }

  await navigateTo(`/workspaces/${workspaceId}`);
}
</script>

<template>Redirecting...</template>
