const { Client } = require("@notionhq/client");
let notion;

const nestBlocks = ["to_do", "paragraph", "bulleted_list_item", "numbered_list_item", "image"]
const slideSplitter = ["heading_1", "divider", "toggle", "callout"]

// let token = "secret_lDLNauvIFirlhqqRMvKHv3o3W87JDKhHVap46wRZBoL"

const getBlockChildren = async function (id, data) {
  const response = await notion.blocks.children.list({
    block_id: id
  })
  let arrBlocks = [];

  for (let index = 0; index < response.results.length; index++) {
    const item = response.results[index];
    if (item.has_children) {
      await getBlockChildren(item.id, item)
    } else if (item.type == "child_page") {
      await getBlockChildren(item.id, item)
    } else if (item.type == "child_database") {
      await getDatabase(item.id, item)
    }
    if (item.type != "unsupported") {
      arrBlocks.push(item);
    }
  };
  if (!data.subblocks) data.subblocks = []
  data.subblocks = arrBlocks;
};

const getDatabase = async function (id, db) {
  // const response = await getDBContentFromNotion(id, token)
  const response = await notion.databases.query({
    database_id: id
  })
  db.database = response;
};

const parseSlide = function (slide) {
  let newSlide = {};
  if (!slide.title && slide.label) {
    slide.title = slide.label;
    delete slide.label
  } else if (!slide.subtitle && slide.label) {
    slide.subtitle = slide.label;
    delete slide.label
  }

  if (slide.title) {
    let child = slide.title.childrens[0];
    newSlide.title = parseText(child[child.type])
  }

  if (slide.subtitle) {
    let child = slide.subtitle.childrens[0];
    newSlide.subtitle = parseText(child[child.type])
  }

  if (slide.label) {
    let child = slide.title.childrens[0];
    newSlide.slidelabel = parseText(child[child.type])
  }

  if (slide.graphic) {
    let graphics = slide.graphic.childrens;
    if (graphics?.length > 1) {
      if (slide.graphic.type == "paragraph") {
        let value = ""
        graphics.forEach(element => {
          value = value + "/n" + parseText(element[element.type]).value
        });
        if (!newSlide.subtitle || newSlide.subtitle.value == "")
          newSlide.subtitle = { type: "text", value: value }
        else {
          newSlide.takeawaydata = { type: "text", value: value }
        }
      } else {
        let data = { "outlinetype": slide.graphic.type == "image" ? "image" : "none", subtype: slide.graphic.type == "to_do" || slide.graphic.type == "paragraph" || slide.graphic.type == "bulleted_list_item" ? "bulleted" : slide.graphic.type == "image" ? "image" : "numbered" }
        data.matrix = [];
        graphics.forEach(element => {
          data.matrix.push({ matrix: [parseText(element[element.type])] })
        });
        newSlide.elements = [{
          data: data, "outlinetype": "diagram",
          "type": "list",
        }]
      }
    } else if (slide.graphic.type == "paragraph") {
      let child = slide.graphics.childrens[0];
      if (!newSlide.subtitle || newSlide.subtitle.value == "")
        newSlide.subtitle = parseText(child[child.type])
      else {
        newSlide.takeawaydata = parseText(child[child.type])
      }
    } else if (slide.graphic.type == "child_database") {
      let tableData = slide.graphic
      let data = { "outlinetype": "table", subtype: "table" }
      data.matrix = [];
      let header = true;
      if (tableData.database?.results) {
        tableData.database?.results.forEach(result => {
          let arrProps = Object.keys(result.properties)
          if (header) {
            let rowHeader = { matrix: [] }
            data.matrix.push(rowHeader)
            for (let r = 0; r < arrProps.length; r++) {
              rowHeader.matrix.push({ titleHolder: { type: "text", value: arrProps[r], contenttype: "text" } })
            }
            header = false
          }
          let row = { matrix: [] }
          for (let v = 0; v < arrProps.length; v++) {
            const objData = result.properties[arrProps[v]];
            row.matrix.push(parseTableText(objData))
          }
          if (row.matrix.length > 0)
            data.matrix.push(row)

        });
      }
      newSlide.elements = [{
        data: data, "outlinetype": "table",
        "type": "table",
      }]
    } else if (slide.graphic.type == "quote") {
      let quote = graphics[0]
      newSlide.title = parseText(quote[quote.type])
      newSlide.properties = { "name": "quote-simple-sty-a" }
    } else if (slide.graphic.type == "embed") {
      let embed = graphics[0]
      newSlide.embed = embed[embed.type]
    } else if (slide.graphic.type == "code") {
      let code = graphics[0]
      newSlide.code = parseText(code[code.type]);
      newSlide.title = { value: newSlide.code.value, type: "text" }
      newSlide.code.language = code[code.type].language;
      newSlide.code.caption = code[code.type].caption;
    } else if (slide.graphic.type == "table") {
      let tableData = graphics[0]
      let data = { "outlinetype": "table", subtype: "table" }
      data.matrix = [];
      if (tableData.subblocks) {
        tableData.subblocks.forEach(result => {
          let row = { matrix: [] }
          data.matrix.push(row)
          let cells = result.childrens[0].table_row.cells
          for (let v = 0; v < cells.length; v++) {
            const objData = cells[v][0];
            let objParsed = parseTableText(objData)
            objParsed.objdata = objData
            row.matrix.push(objParsed)
          }
        });
      }
      newSlide.elements = [{
        data: data, "outlinetype": "table",
        "type": "table",
      }]
    }
  }

  if (slide.toggle) {
    let child = slide.toggle.childrens[0];
    newSlide.title = parseText(child[child.type])
  }
  return newSlide;
};

const parseNewSlide = function (slide) {
  let newSlide = {};
  if (!slide.title && slide.label) {
    slide.title = slide.label;
    delete slide.label
  } else if (!slide.subtitle && slide.label) {
    slide.subtitle = slide.label;
    delete slide.label
  }

  if (slide.title) {
    let child = slide.title;
    newSlide.title = parseText(child[child.type])
  }

  if (slide.subtitle) {
    let child = slide.subtitle;
    newSlide.subtitle = parseText(child[child.type])
  }

  if (slide.label) {
    let child = slide.label;
    newSlide.slidelabel = parseText(child[child.type])
  }

  let indent = 1;
  if (slide.graphic) {
    let graphics = slide.graphic.childrens;
    if (graphics?.length > 1) {
        let subType = slide.graphic.type == "to_do" || slide.graphic.type == "bulleted_list_item" ? "bulleted" : slide.graphic.type == "image" ? "image" : "numbered"
        subType = slide.graphic.type == "list" ? "none" : subType;
        let data = { 
          "outlinetype": slide.graphic.type == "image" ? "image" : "none", 
          subtype: subType
        }
        data.matrix = [];
        graphics.forEach(element => {
          let textData = parseText(element[element.type])
          let subMatrix = [textData]
          if (textData.value.trim() != "") data.matrix.push({ matrix:  subMatrix})
          if (element.subblocks) addSubList(subMatrix, element.subblocks)
        });
        if (slide.graphic.type == "to_do") {
          data.properties = {graphicname: "ver-ckd-tx-sty-b"}
        }
        newSlide.elements = [{
          data: data, 
          "outlinetype": "diagram",
          "type": "list",
        }]
      //}
    } else if (slide.graphic.type == "paragraph" || slide.graphic.type == "callout") {
      let child = slide.graphic.childrens[0];
      if (!newSlide.title || newSlide.title == "") {
        newSlide.title = parseText(child[child.type])
      }else if (!newSlide.subtitle || newSlide.subtitle.value == "")
        newSlide.subtitle = parseText(child[child.type])
      else {
        newSlide.takeawaydata = parseText(child[child.type])
      }
    } else if (slide.graphic.type == "child_database") {
      let tableData = slide.graphic.childrens[0]
      let data = { "outlinetype": "bulleted", subtype: "bulleted" }
      data.matrix = [];
      let header = true;
      if (tableData.database?.results) {
        tableData.database?.results.forEach(result => {
          let arrProps = Object.keys(result.properties)
          if (header) {
            let rowHeader = { matrix: [] }
            data.matrix.push(rowHeader)
            for (let r = 0; r < arrProps.length; r++) {
              let cellproperties = {
                "width": 170,
                "height": 70
            }
              rowHeader.matrix.push({ titleHolder: { type: "text", value: arrProps[r], contenttype: "text" }, cellproperties:cellproperties })
            }
            header = false
          }
          let row = { matrix: [] }
          for (let v = 0; v < arrProps.length; v++) {
            const objData = result.properties[arrProps[v]];
            let nodeData = parseTableText(objData);
            row.matrix.push(nodeData)
          }
          if (row.matrix.length > 0) {
          data.matrix.push(row)
          }
        });
      }
      data.properties =  {graphicname: "tbl-sty-a-57"};
      newSlide.elements = [{
        data: data, 
        "outlinetype": "multicontenttable",
        "subtype": "multicontenttable",
      }]
    } else if (slide.graphic.type == "quote") {
      let quote = graphics[0]
      newSlide.title = parseText(quote[quote.type])
      newSlide.properties = { "name": "quote-simple-sty-a" }
    } else if (slide.graphic.type == "embed") {
      let embed = graphics[0]
      newSlide.embed = embed[embed.type]
    } else if (slide.graphic.type == "code") {
      let code = graphics[0]
      newSlide.code = parseText(code[code.type]);
      newSlide.title = { value: newSlide.code.value, type: "text" }
      newSlide.code.language = code[code.type].language;
      newSlide.code.caption = code[code.type].caption;
    } else if (slide.graphic.type == "table") {
      let tableData = slide.graphic.childrens[0]
      let data = { "outlinetype": "bulleted", subtype: "bulleted" }
      data.matrix = [];
      if (tableData.subblocks) {
        tableData.subblocks.forEach(result => {
          let row = { matrix: [] }
          data.matrix.push(row)
          let cells = result.table_row.cells
          for (let v = 0; v < cells.length; v++) {
            let arrCellData = cells[v];
            let obj = {};
            arrCellData.forEach(cellData => {
              let objParsed = parseTableText(cellData)
              obj = {...obj, ...objParsed};
            })
            obj.cellproperties = {
              "width": 200,
              "height": 70
          }
            row.matrix.push(obj)
          }
        });
      }
      data.properties =  {graphicname: "tbl-sty-a-57"};
      newSlide.elements = [{
        data: data, 
        "outlinetype": "multicontenttable",
        "subtype": "multicontenttable"
      }]
    } else if (slide.graphic.type == "column_list") {
      arrColListItem = slide.graphic.childrens[0].subblocks;

      let arrRow = [];
      for(let i=0;i<arrColListItem.length;i++) {
        let arrItem = arrColListItem[i].subblocks;
        for(let j=0;j<arrItem.length;j++) {
          let nodeItem = arrItem[j];
          let matrix = nodeDataForTable(nodeItem,"");
          arrRow.push({matrix: matrix});
        }
      }
      let data = {matrix:arrRow, subtype:"image", outlinetype:"image"}
      newSlide.elements = [{
        data: data, 
        "outlinetype": "diagram",
        "type": "diagram",
      }]
    } else if (slide.graphic.type == "link_preview" || slide.graphic.type == "embed" || slide.graphic.type == "bookmark") {
      let embedObj = graphics[0]
      let embd = embedObj[embedObj.type]
      newSlide.embed = {
        value: embd.url,
        autogenerate: true,
      }
    }else if (slide.graphic.type == "video" || slide.graphic.type == "audio" || slide.graphic.type == "file") {
      let embedObj = graphics[0]
      let embd = embedObj[embedObj.type];
      let url = embd[embd.type]?.url
      newSlide.embed = {
        value: url,
        autogenerate: true,
      }
    }
  }

  function addSubList(matrix, subBlocks, indent = 1) {
    subBlocks.forEach(element => {
      let subdata = parseText(element[element.type])
      subdata.indent = indent;
      matrix.push(subdata);
      if (element.subblocks) {
        addSubList(matrix, element.subblocks, indent+1)
      }
    })
  }

  if (slide.toggle) {
    let child = slide.toggle.childrens[0];
    newSlide.title = parseText(child[child.type])
  }

  if (slide.extraData && !newSlide.graphic) {
    parseList(slide.extraData.type, slide.extraData.childrens, newSlide);
    // newSlide.graphic = slide.extraData
  } else if (slide.extraData) {
    let textData = slide.extraData.childrens.map(obj => {
      let objData = obj[obj.type]?.text?.map?.(text => text.plain_text).join("");
      return {type: "text", value: objData}
    })
    newSlide.extraData = textData
  }
  return newSlide;
};

const parseObjectText = function (typeObj) {
  let plainText = typeObj && typeObj.plain_text ? typeObj.plain_text : " ";
  try {
    if (typeObj && typeObj.type?.toLowerCase() == "status") {
      plainText = typeObj.status?.name || typeObj.name || " ";
    } else if (typeObj && typeObj.type?.toLowerCase() == "people") {
      plainText = typeObj.name || " ";
    } else if (typeObj && typeObj.type?.toLowerCase() == "person") {
      plainText = typeObj.name || " ";
    } else if (typeObj && typeObj.type?.toLowerCase() == "email") {
      plainText = typeObj.email;
    } else if (typeObj && typeObj.type?.toLowerCase() == "external") {
      plainText = typeObj["external"].url;
    } else if (typeObj && typeObj.type?.toLowerCase() == "created_time") {
      plainText = typeObj.created_time;
    } else if (typeObj && typeObj.type?.toLowerCase() == "date") {
      let startDate = typeObj.date?.start || typeObj.start || " "
      let endDate = typeObj.date?.end || typeObj.end || " "
      plainText = `${startDate}${endDate != " " ? " - " + endDate : ""}`;
    } else if (typeObj && typeObj.name) {
      plainText = typeObj.name || " ";
    } else if (typeObj.type?.toLowerCase() == "text") {
      plainText = textObj.plain_text || "";
    }
  } catch (error) {
    console.log(typeObj)
    console.log(error)
  }

  return plainText;
}

const parseText = function (textData) {
  try {
    if (textData && textData.text && textData.text.length > 0) {
      let objData = { type: "text", value: "" };
      textData.text.forEach(textObj => {
        let type = textObj.type;
        objData.value = objData.value + " " + textObj.plain_text
        objData.annotations = textObj.annotations;
        if (type != "text") {
          objData.extraData = textObj[type]
          objData.extraType = type
        }
      });
      if (textData.checked) objData.subdata = "checked";
      if (textData.icon?.type == "emoji") objData.value = textData.icon.emoji + " " + objData.value;
      return objData;
    } else if (textData && textData.rich_text && textData.rich_text.length > 0) {
      let objData = { type: "text", value: "" };
      textData.rich_text.forEach(textObj => {
        let type = textObj.type;
        objData.value = objData.value + " " + textObj.plain_text
        objData.annotations = textObj.annotations;
        if (type != "text") {
          objData.extraData = textObj[type]
          objData.extraType = type
        }
      });
      return objData;
    } else if (textData && textData.type == "external") {
      let plainText = parseObjectText(textData)
      return { type: "image", value: plainText, extraData: textData }
    } else if (textData) {
      let plainText = parseObjectText(textData)
      return { type: "text", value: plainText, extraData: textData }
    }
  } catch (error) {
    console.log(error)
    return { type: "text", value: "", error: error }
  }

}

const parseTableText = function (textData) {
  try {
    if (textData && textData.type && textData[textData.type] && Array.isArray(textData[textData.type]) && textData[textData.type].length > 0) {
      let typeObj = textData[textData.type][0];
      let plainText = parseObjectText(typeObj);
      return nodeDataForTable(textData, plainText)
    } else if (textData && textData.type && !textData.plain_text) {
      let plainText = parseObjectText(textData);
      return nodeDataForTable(textData, plainText)
    } else if (textData && textData.plain_text) {
      return nodeDataForTable(textData, textData.plain_text)
    } else {
      return { type: "text", value: "", error: "No Data" }
    }
  } catch (error) {
    console.log(error)
    return { type: "text", value: "", error: error }
  }

}

const nodeDataForTable = (extraData, value) => {
  switch (extraData.type) {
    case "text":
    case "date":
    case "files":
    case "title":
    case "email":
    case "rich_text":
      return { titleHolder: { type: "text", contenttype: extraData.type, value: value, textproperties: extraData.annotations || {}, extraData: extraData } }
    case "mention":
      return { subTitleHolder: { type: "list", items:[{type:"text", value: extraData.plain_text}]} }
    case "select": {
      let selectText = extraData.select.name;
      return { titleHolder: { type: "text", contenttype: extraData.type, value: selectText, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "status": {
      let statusText = extraData.status.name;
      return { titleHolder: { type: "text", contenttype: extraData.type, value: statusText, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "url": {
      return { titleHolder: { type: "text", contenttype: extraData.type, value: extraData.url, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "multi_select": {
      let multiText = extraData["multi_select"]?.map(data => data.name).join(",");
      return { titleHolder: { type: "text", contenttype: extraData.type, value: multiText, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "number": {
      return { valueTitleHolder: { type: "text", contenttype: extraData.type, value: extraData.number, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "checkbox": {
      let result = extraData.checkbox.toString()
      return { titleHolder: { type: "text", contenttype: extraData.type, value: result, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "people": {
      let peopleText = extraData["people"]?.map(data => data.name).join(",");
      let author = getAuthorDetails(extraData["people"]?.[0]);
      return {authorStyle: author};
      return { titleHolder: { type: "text", contenttype: extraData.type, value: peopleText, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "formula": {
      return { titleHolder: { type: "text", contenttype: extraData.type, value: extraData.formula.string, textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "last_edited_by":
    case "created_by":
      {
        return { titleHolder: { type: "text", contenttype: extraData.type, value: extraData[extraData.type].name, textproperties: extraData.annotations || {}, extraData: extraData } }
      }
    case "created_time":
    case "phone_number":
    case "last_edited_time":
      {
        return { titleHolder: { type: "text", contenttype: extraData.type, value: extraData[extraData.type], textproperties: extraData.annotations || {}, extraData: extraData } }
    }
    case "image": {
      let imageData = extraData.image;
      let content = {type: "image", contenttype:"image", value: imageData[imageData.type]?.url}
      let data = [content];
      if (imageData.caption) {
        let captionText = imageData.caption.reduce((acc, textData) => acc = acc + " " + textData.plain_text, "");
        data.push({type: "text", value: captionText});
      }
      return data;
    }
  }
}

const getListData = async function (data, obj) {
  obj = { ...obj, type: data[data.type].text[0].type, value: data[data.type].text[0].text.content }
  if (data.has_children) {
    const response = await notion.blocks.children.list({
      block_id: data.id
    })
    if (response.results.length > 0) {
      obj.children = { obj: {} }
      obj.children.obj = await getListData(response.results[0], obj.children.obj)
    }
  }

  return obj;
}

const getAuthorDetails = (people) => {
  return  {
        "subNodes": {
            "authorImageHolder": {
                value: people.avatar_url,
                contenttype: "image"
            },
            "authorGroup": {
                "subNodes": {
                    "authorNameHolder": {
                        "name": "authorNameHolder",
                        "visible": true,
                        value: people.name,
                        type: "text"

                    },
                    "authorDesHolder": {
                        "name": "authorDesHolder",
                        "visible": true,
                        value: people.person.email,
                        type: "text"
                    }
                }
            }
        }
    
}
}

const splitSlides = function(arrSubblocks) {
  let arrSlides = [];
  let objGraphic = {type: "", childrens:[]};
  let slideElements = {};
  let previousType = "";
  let keys = [];
  let paragraph = [];

  for(let l=0;l<arrSubblocks.length;l++){
    let item = arrSubblocks[l];
    keys = Object.keys(slideElements);

    if (item.type == "divider") continue;
    if (keys.includes(HeaderKey[item.type])) createNewSlide()
    else if (objGraphic.childrens.length > 0 && previousType != item.type) createNewSlide()

    if (item.type == "heading_1" && !keys.includes("title")) {
      let text = item[item.type].text?.[0]?.plain_text || ""
      if (text == "") continue;
      slideElements.title = item;
    }else if (item.type == "heading_2" && !keys.includes("subtitle")) {
      let text = item[item.type].text?.[0]?.plain_text || ""
      if (text == "") continue;
      if (!slideElements.title) slideElements.title = item
      else slideElements.subtitle = item;
    }else if (item.type == "heading_3" && !keys.includes("label")) {
      let text = item[item.type].text?.[0]?.plain_text || ""
      if (text == "") continue;
      if (!slideElements.title) slideElements.title = item
      else if (!slideElements.subtitle) slideElements.subtitle = item
      else slideElements.label = item
    }else if (item.type == "paragraph") {
      if (previousType == item.type || paragraph.length == 0) {
        paragraph.push(item)
        previousType = item.type
        continue
      }
      let text = item[item.type].text?.map(nodeText => nodeText.plain_text).join("");
      if (text == "") continue;
      if (!slideElements.title) slideElements.title = item
      else if (!slideElements.subtitle) slideElements.subtitle = item
      else slideElements.label = item
    }else {
      if (previousType == item.type || objGraphic.childrens.length == 0) {
        objGraphic.type = item.type;
        if (item.type == "child_page") item.subblocks = splitSlides(item.subblocks)
        objGraphic.childrens.push(item)
      }
      previousType = item.type
    }
  }

  // if (objGraphic.childrens.length > 0) slideElements.graphic = objGraphic;
  // if (Object.keys(slideElements).length > 0) arrSlides.push(slideElements);
  createNewSlide()

  function createNewSlide() {
    if (objGraphic.childrens.length > 0) {
      slideElements.graphic = objGraphic;
      if (paragraph.length > 0) slideElements.extraData = {type: "paragraph", childrens: paragraph}
    }else if (paragraph.length > 0) {
      if (paragraph.length == 1 && !slideElements.subtitle) slideElements.subtitle = paragraph[0];
      slideElements.graphic = {type: "list", childrens: paragraph}
    }
    if (Object.keys(slideElements).length > 0) arrSlides.push(slideElements);
    keys = [];
    slideElements = {};
    previousType = "";
    objGraphic = {type: "", childrens:[]};
    paragraph = [];
  }

  return arrSlides
}

const parseList = function(graphicType, arrChildrens, slideObj) {
  let subType = graphicType == "to_do" || graphicType == "bulleted_list_item" ? "bulleted" : graphicType == "image" ? "image" : "numbered"
  subType = graphicType == "list" ? "none" : subType;
  let data = { 
    "outlinetype": graphicType == "image" ? "image" : "none", 
    subtype: subType
  }
  data.matrix = [];
  arrChildrens.forEach(element => {
    let textData = parseText(element[element.type])
    let subMatrix = [textData]
    if (textData.value.trim() != "") data.matrix.push({ matrix:  subMatrix})
    if (element.subblocks) addSubList(subMatrix, element.subblocks)
  });
  if (graphicType == "to_do") {
    data.properties = {graphicname: "ver-ckd-tx-sty-b"}
  }
  slideObj.elements = [{
    data: data, 
    "outlinetype": "diagram",
    "type": "list",
  }]
}

const HeaderKey = {
  "heading_1": "title",
  "heading_2": "subtitle",
  "heading_3": "lable",
}

// Test-508f16a671b84633895c52307990d920
// 94cf19fb911240f78e6aeb565f3178e1
exports.getDatabase = async function (pid) {
  const data = {}
  try {
    await getBlockChildren(pid, data)
    let mainSlides = [];
    let arrSlides = [];
    let slides = [];
    let count = 0;
    
    for (let index = 0; index < data.subblocks.length; index++) {
      const slide = data.subblocks[index];
      if (slides.length == 0 || !slideSplitter.includes(slide.type)) {
        slides.push(slide)
        count = count + 1;
      } else {
        mainSlides.push(slides)
        count = count + 1;
        slides = [slide]
      }
    }
    if (slides.length != 0)
      mainSlides.push(slides)

    let slide = {};
    for (let j = 0; j < mainSlides.length; j++) {
      const mainSlide = mainSlides[j];
      for (let k = 0; k < mainSlide.length; k++) {
        const subSlide = mainSlide[k];
        const hasGraphic = subSlide.isList || subSlide.type == "child_database" || subSlide.type == "embed" || subSlide.type == "quote" || subSlide.type == "code" || subSlide.type == "table"
        if (!slide.title && subSlide.type == "heading_1") {
          if (Object.keys(slide).length > 0)
            arrSlides.push(slide)
          slide = {}
          slide.title = subSlide;
        } else if (!slide.subtitle && subSlide.type == "heading_2") {
          if (!slide.title) {
            slide.title = subSlide;
          } else {
            slide.subtitle = subSlide;
          }
        } else if (!slide.label && subSlide.type == "heading_3") {
          if (!slide.subtitle) {
            slide.subtitle = subSlide;
          } else {
            slide.label = subSlide;
          }
        } else if (subSlide.type == "toggle") {
          if (Object.keys(slide).length > 0)
            arrSlides.push(slide)
          slide = { toggle: subSlide }
          arrSlides.push(slide)
          slide = {}
        } else if (subSlide.type == "callout") {
          if (Object.keys(slide).length > 0)
            arrSlides.push(slide)
          slide = { callout: subSlide }
          arrSlides.push(slide)
          slide = {}
        } else if (hasGraphic && !slide.graphic) {
          slide.graphic = subSlide;
        } else if (hasGraphic && slide.graphic) {
          if (Object.keys(slide).length > 0)
            arrSlides.push(slide)
          slide = {}
          slide.graphic = subSlide;
        } else if (!hasGraphic && subSlide.type == "paragraph") {
          if (!slide.label)
            slide.label = subSlide;
          else slide.takeaway = subSlide
        } else {
          if (Object.keys(slide).length > 0)
            arrSlides.push(slide)
          slide = {}
          if (subSlide.type == "heading_1") {
            slide.title = subSlide;
          } else if (subSlide.type == "heading_2") {
            slide.subtitle = subSlide;
          } else if (subSlide.type == "heading_3") {
            slide.label = subSlide;
          }
        }
      }
    }
    arrSlides.push(slide)

    arrSlides = splitSlides(data.subblocks);
    let arrFinalSLides = []
    for (let s = 0; s < arrSlides.length; s++) {
      const slideData = arrSlides[s];
      // let parsedData = parseSlide(slideData);
      let parsedData = parseNewSlide(slideData);
      if (Object.keys(parsedData).length > 0)
        arrFinalSLides.push(parsedData)
    }
    return { slides: arrFinalSLides,generated:true, original: arrSlides, data: data };

  } catch (error) {
    console.log(error)
    return { error: error, data: data };
  }
};

exports.setAuthKey = function(key){
  notion = new Client({ auth: key });
}
// paragraph && length == 1 && without 2 and 3  = 'subtitle';
// paragraph && length == 1 && with 2 or 3  = 'slidelabel';
// paragraph && length>1 = 'list';
// todo = 'list';
// bullet = 'list';
// number = 'list';
// singleimage = "bg"
// multipleimage = "imagegrid"
// toggle = "slide"




