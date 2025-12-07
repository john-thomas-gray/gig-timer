import { saveData } from './storage.js';
import { convertUrlToRegExp } from './urlUtils.js';
import { storageCache } from './background.js';

document.addEventListener('DOMContentLoaded', () => {
  const assignmentsInput = document.getElementById('assignmentsInput');
  const workplaceInput = document.getElementById('workplaceInput');
  const submitButton = document.getElementById('submitURLs');

  if (storageCache?.URLs?.assignments) assignmentsInput.value = storageCache.URLs.assignmentsInput;
  if (storageCache?.URLs?.workplace) workplaceInput.value = storageCache.URLs.workplaceInput;

  submitButton.addEventListener('click', async () => {
    const assignments = convertUrlToRegExp(assignmentsInput.value);
    const workplace = convertUrlToRegExp(workplaceInput.value);

    const data = {
      assignments: assignments,
      workplace: workplace
    }

    try {
      await saveData('URLS', data)
      console.log('saved data: URLS: ', data)
    } catch (error) {
      console.error('Error saving URLs:', error)
    }
  })
})
