function objectPropertyChanged(objectClass,objectId,propName,new_value,
        toUpdateEleId){
    fetch("/update_object_property/"+objectClass+"/" + objectId, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: "{\""+propName+"\":\""+new_value+"\"}"
    })
    .then(response => {
        if (response.ok) {
            console.log('Data updated successfully. Reloading page');
            document.getElementById(toUpdateEleId).textContent = new_value;
            document.getElementById(toUpdateEleId).dataset.value = new_value;
            //location.reload();
        } else {
            throw new Error('Error:' + response.statusText);
        }
    })
    .catch(error => {
        console.error(error); //console.error('Error:', error);
    });
}
