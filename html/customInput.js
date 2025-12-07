export const customInput = () => {
  document.getElementById('addButton').addEventListener('click', function() {

    const addFieldValue = document.getElementById('addField').value;

    let newFormGroup = document.createElement('div');
    newFormGroup.className = 'input-group';

    let newField = document.createElement('input');
    newField.type = 'text';
    newField.name = `dynamicField-${Date.now()}`
    newField.id = `dynamicField-${Date.now()}`

    let newLabel = document.createElement('label')
    newField.setAttribute('for', newField.id);
    newLabel.textContent = addFieldValue;

    let removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';

    newFormGroup.appendChild(newLabel);
    newFormGroup.appendChild(newField);
    newFormGroup.appendChild(removeButton);

    document.getElementById('customFields').prepend(newFormGroup);

    removeButton.addEventListener('click', function() {
      newFormGroup.remove();
    });
  })
}

customInput();
