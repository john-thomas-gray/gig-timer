export const findProjectDataSetByTitle = (collection, key) => {
  if (!collection || !Array.isArray(collection)) {
    return undefined;
  }
  return collection.find((entry) => entry.projectTitle === key);
};
