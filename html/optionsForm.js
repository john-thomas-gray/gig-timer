const optionsForm = () => {
  document.getElementById('addButton').addEventListener('click', function() {

    let newFormGroup = document.createElement('div');
    newFormGroup.className = 'form-group';

    let newField = document.createElement('input');
    newField.type = 'text';
    newField.name = 'dynamicField';

    let removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';

    newFormGroup.appendChild(newField)
    newFormGroup.appendChild(removeButton);

    document.getElementById('projectForm').appendChild(newFormGroup);

    removeButton.addEventListener('click', function() {
      newFormGroup.remove();
    });
  })
}

optionsForm();
