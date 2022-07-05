require("dotenv").config();
const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const nestBlocks = ["to_do", "paragraph", "bulleted_list_item", "numbered_list_item", "image"]
const slideSplitter = ["heading_1", "divider", "toggle", "callout"]


const getBlockChildren = async function (id, data) {
  const response = await notion.blocks.children.list({
    block_id: id
  })
  let arrBlocks = [];
  let arrSubBlocks = []
  for (let index = 0; index < response.results.length; index++) {
    const item = response.results[index];
    if (arrSubBlocks.length == 0 || (item.type == arrSubBlocks[arrSubBlocks.length - 1].type && nestBlocks.includes(item.type))) {
      if (item.has_children) {
        await getBlockChildren(item.id, item)
      } else if (item.type == "child_page") {
        await getBlockChildren(item.id, item)
        console.log(item)
      } else if (item.type == "child_database") {
        await getDatabase(item.id, item)
      }
      arrSubBlocks.push(item)
    } else if (arrSubBlocks.length != 0) {
      arrBlocks.push({ type: arrSubBlocks[0].type, childrens: arrSubBlocks, isList: arrSubBlocks.length > 1 });
      if (item.has_children) {
        await getBlockChildren(item.id, item)
      } else if (item.type == "child_page") {
        await getBlockChildren(item.id, item)
        console.log(item)
      } else if (item.type == "child_database") {
        await getDatabase(item.id, item)
      }
      arrSubBlocks = [item];
    }
  };
  data.subblocks = arrBlocks;
};


const getDatabase = async function (id, db) {
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
    if (graphics.length > 1) {
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
      let tableData = graphics[0]
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
              rowHeader.matrix.push({ type: "text", value: arrProps[r] })
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
      plainText = typeObj.date?.start || typeObj.start || " ";
    } else if (typeObj && typeObj.name) {
      plainText = typeObj.name || " ";
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
      return { type: "text", value: plainText, annotations: typeObj ? typeObj.annotations : {}, extraData: typeObj }
    } else if (textData && textData.type && !textData.plain_text) {
      let plainText = parseObjectText(textData);
      return { type: "text", value: plainText, annotations: textData.annotations || {}, extraData: textData }
    } else if (textData && textData.plain_text) {
      return { type: "text", value: textData.plain_text, annotations: textData.annotations || {}, extraData: textData }
    } else {
      return { type: "text", value: "", error: "No Data" }
    }
  } catch (error) {
    console.log(error)
    return { type: "text", value: "", error: error }
  }

}


exports.getDatabase = async function () {
  const data = {}
  try {
    await getBlockChildren("94cf19fb911240f78e6aeb565f3178e1", data)
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
          if (subSlide.type == "heading_2") {
            slide.subtitle = subSlide;
          } else if (subSlide.type == "heading_3") {
            slide.label = subSlide;
          }
        }
      }
    }
    arrSlides.push(slide)

    let arrFinalSLides = []
    for (let s = 0; s < arrSlides.length; s++) {
      const slideData = arrSlides[s];
      let parsedData = parseSlide(slideData);
      if (Object.keys(parsedData).length > 0)
        arrFinalSLides.push(parsedData)
    }
    return { slides: arrFinalSLides, original: arrSlides, data: data };

  } catch (error) {
    return { error: error, data: data };
  }
};

// paragraph && length == 1 && without 2 and 3  = 'subtitle';
// paragraph && length == 1 && with 2 or 3  = 'slidelabel';
// paragraph && length>1 = 'list';
// todo = 'list';
// bullet = 'list';
// number = 'list';
// singleimage = "bg"
// multipleimage = "imagegrid"
// toggle = "slide"




