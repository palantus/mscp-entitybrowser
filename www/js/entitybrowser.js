"use strict"

class Entity{
  init(){
    this.nextId = 1
    this.views = {}

    $(document).keyup((e) => {
      if (e.keyCode == 27) { // escape key maps to keycode `27`
        $(".toolbarbutton").removeClass("open")
        $(".itemaction").removeClass("clicked")
      }
    });
  }

  async run(){
    await mscp.ready;
    this.types = await mscp.types()
    this.addView(getUrlVar("folder") || "/")
  }

  addView(folder){
    let id = `folderview${this.nextId}`
    this.nextId++

    let view = new FolderView(id)
    view.create()
    view.showFolder(folder)

    this.views[id] = view
  }
}

class FolderView{
  constructor(elementId){
    this.elementId = elementId
  }

  create(){
    this.typeHandler = new TypeHandler(this)

    let html = `
          <div class="folderview" id="${this.elementId}">
            <button class="backbutton">Back</button>
            <span class="toolbarbutton">
              <button>Add new</button>
              <span class="addnewcontainer dropdownmenu">
                <select name="type" value="folder" size="${Object.keys(this.typeHandler.types).length}">${this.typeHandler.typesSelectValues}</select>
                <input type="text" name="title" placeholder="Title"></input>
                <div class="params"></div>
                <button>Add</button>
              </span>
            </span>
            <span class="toolbarbutton">
              <button>Add existing</button>
              <span class="addexistingcontainer dropdownmenu">
                <select name="type" value="folder" size="${Object.keys(this.typeHandler.types).length-1}">${this.typeHandler.typesSelectValuesNoFolder}</select>
                <input type="text" name="identifier" placeholder="Identifier"></input>
                <input type="text" name="title" placeholder="Title"></input>
                <div class="params"></div>
                <button>Add</button>
              </span>
            </span>

            <span class="folderpath"></span>
            <div>
              <ul class="foldercontent">
              </ul>
            </div>
            <div class="propertiescontainer"></div>
          </div>`

    this.element = $(html)
    $("#content").append(this.element)
    this.element.find(".toolbarbutton > button").click((e) => {
      let isOpen = $(e.target).parent().is(".open")
      this.element.find(".toolbarbutton").removeClass("open")
      $(e.target).parent().toggleClass('open', !isOpen).find('select').focus().val('folder');
      e.stopPropagation();
    })
    this.element.find("button.backbutton").click((e) => this.back($(e.target)))
    this.element.find("span.addnewcontainer typeselct").change((e) => this.typeHandler.addNewTypeChanged($(e.target)))
    this.element.find("span.addnewcontainer button").click((e) => this.typeHandler.addNewExecute($(e.target)))
    this.element.find("span.addexistingcontainer button").click((e) => this.typeHandler.addExistingExecute($(e.target)))
  }

  async showFolder(path){
    path = path.toLowerCase()
    
    let folder = await mscp.folder(path)
    if(folder == null){
      alert("Unknown folder")
      return;
    }

    this.path = path
    this.element.find(".backbutton").prop("disabled",this.path == "/")
    this.element.find("span.folderpath").html(folder.path)

    let container = this.element.find(".foldercontent")
    container.empty()

    folder.content = folder.content.sort((a, b) => {
      if(a.properties.type == "folder" && b.properties.type != "folder") return -1
      else if(a.properties.type != "folder" && b.properties.type == "folder") return 1
      else return a.properties.title.toLowerCase() > b.properties.title.toLowerCase() ? 1 : -1
    })

    for(let e of folder.content){
      let folderItem = $("<li/>", {class: "folderitem"})

      let title = e.properties.title || e.id
      folderItem.append($("<img/>", {src: this.typeHandler.types[e.properties.type].icon || "/mscp/libs/img/help.png"}))
      $("<span/>", {class: "itemname", html: title}).appendTo(folderItem).click((e) => {this.itemClicked($(e.target).parent()); e.stopPropagation();})
      folderItem.data("item", e)
      folderItem.click((e) => {
        let selected = $(e.currentTarget).is(".selected")
        $(e.currentTarget).parents(".foldercontent").find(".folderitem").removeClass("selected");
        $(e.currentTarget).toggleClass("selected", !selected)
      })

      let itemActions = $(`<span class="itemactions"/>`)

      // DELETE BUTTON
      let deleteActionHTML = `<span class="itemaction" title="Remove">
                                <img src="/mscp/libs/img/delete.png"/>
                                <span class="confirm dropdownmenu">
                                  <div>Are you sure?</div>
                                  <span class="smallbutton ok">Yes</span>
                                  <span class="smallbutton cancel">No</span>
                                </span>
                              </<span>`

      let deleteAction = $(deleteActionHTML)
      deleteAction.find(".ok").click((e) => {this.itemDelete($(e.target).parents(".folderitem").data("item")); e.stopPropagation();})
      itemActions.append(deleteAction)

      // RENAME BUTTON
      if(e.properties.type != "folder"){
        let editActionHTML = `<span class="itemaction" title="Rename">
                                  <img src="/mscp/libs/img/edit.ico"/>
                                  <span class="dropdownmenu">
                                    <input name="title" placeholder="Title" value="${title}"/>
                                    <span class="smallbutton ok">Ok</span>
                                    <span class="smallbutton cancel">Cancel</span>
                                  </span>
                                </<span>`

        let editAction = $(editActionHTML)
        editAction.find(".ok").click((e) => {this.itemRename($(e.target).parents(".folderitem").data("item"), $(e.target).parent().find("input[name=title]").val()); e.stopPropagation();})
        itemActions.append(editAction)

        // MOVE BUTTON
        let moveActionHTML = `<span class="itemaction" title="Move">
                                  <img src="/mscp/libs/img/forward.png"/>
                                  <span class="dropdownmenu">
                                    <input name="dest" placeholder="Destination path" value="${this.path}"/>
                                    <span class="smallbutton ok">Ok</span>
                                    <span class="smallbutton cancel">Cancel</span>
                                  </span>
                                </<span>`

        let moveAction = $(moveActionHTML)
        moveAction.find(".ok").click((e) => {this.itemMove($(e.target).parents(".folderitem").data("item"), $(e.target).parent().find("input[name=dest]").val()); e.stopPropagation();})
        itemActions.append(moveAction)
      }


      // SHARE BUTTON
      if(this.typeHandler.types[e.properties.type].allowShare){
        let shareActionHTML = `<span class="itemaction" title="Share">
                                  <img src="/mscp/libs/img/share.png"/>
                                  <span class="confirm dropdownmenu">
                                    <label><input type="checkbox" name="writeaccess"/>Write access</label>
                                    <input style="display: none;" type="text" name="generatedlink"/>
                                    <span class="smallbutton generate">Generate</span>
                                    <span class="smallbutton cancel">Close</span>
                                  </span>
                                </<span>`

        let shareAction = $(shareActionHTML)
        shareAction.find(".generate").click(async (e) => {
          let writeAccess = $(e.target).parents(".folderitem").find("input[name=writeaccess]").is(":checked")
          $(e.target).parents(".folderitem").find("input[name=generatedlink]").val(await this.itemShare($(e.target).parents(".folderitem").data("item"), writeAccess)).show().focus().select();
          e.stopPropagation();
        })
        itemActions.append(shareAction)
      }

      folderItem.append(itemActions)
      container.append(folderItem)
    }

    container.find(".itemaction").click((e) => {
      if(!$(e.target).is("img"))
        return;
      let clicked = $(e.currentTarget).is(".clicked");
      $(".folderitem .itemaction").removeClass("clicked");
      $(e.currentTarget).toggleClass("clicked", !clicked);
      if(!clicked) {
        $(e.currentTarget).find("input:first").focus().select();
        $(e.currentTarget).find("input").keyup((e)=>{if(e.keyCode == 13) $(e.target).parents(".itemaction").find(".ok").click(); e.stopPropagation();});
      }
      e.stopPropagation();
    })
    container.find(".itemaction .cancel").click((e) => {$(e.target).parents(".itemaction").removeClass("clicked"); e.stopPropagation()})
  }

  refreshContent(){
    this.showFolder(this.path)
  }

  itemClicked(itemElement){
    let item = itemElement.data("item")

    if(item.properties.type == "folder"){
      this.showFolder(this.path + item.properties.title)
    } else {
      this.typeHandler.openItem(item)
    }
  }

  back(){
    let idx = this.path.substring(0, this.path.length - 1).lastIndexOf("/")
    if(idx < 0)
      this.showFolder("/")
    else
      this.showFolder(this.path.substring(0, idx+1))
  }

  async itemDelete(item){
    await mscp.remove(this.path, item.id)
    this.refreshContent()
  }

  async itemRename(item, newName){
    await mscp.setProperty(item.id, "title", newName)
    this.refreshContent()
  }

  async itemShare(item, writeAccess){
    return this.typeHandler.getShareableLink(item, writeAccess)
  }

  async itemMove(item, destPath){
    await mscp.move(item.id, this.path, destPath)
    this.refreshContent()
  }
}

var entity = new Entity();
entity.init();
$(() => entity.run());

function getUrlVar( name ){
    name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
    var regexS = "[\\?&]"+name+"=([^&#]*)";
    var regex = new RegExp( regexS );
    var results = regex.exec( window.location.href );
    if( results == null )
        return undefined;
    else
        return decodeURIComponent(results[1]);
}
