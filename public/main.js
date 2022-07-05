const getDataFromBackend = async () => {
  const rest = await fetch("http://localhost:8000/users");
  const data = await rest.json();
  return data;
};

const container = document.getElementById("container");
const openFormButton = document.getElementById("newUserButton");
const closeFormButton = document.getElementById("closeFormButton");


closeFormButton.addEventListener("click", () => {
  addUserFormContainer.style.display = "none";
});

// Add data to HTML
const addData = async () => {
  const data = await getDataFromBackend();

  data.subblocks.forEach((value) => {
    const div = document.createElement("div");
    div.classList.add("userContainer");
    div.innerHTML = `
        <h3>${value.type}</h3>
        <p>${value.childrens.length}</p>
    `;

    container.append(div);
  });
};

addData();
