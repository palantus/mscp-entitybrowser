"use strict"

const crypto = require('crypto')
const uuid = require("node-uuid")
const User = require("mscp-user")
const AccessTokenManager = require("mscp-accesstokens");

class Handler{

  async init(){
    this.meta = this.mscp.meta
    this.username = User.getUsernameFromHandlerRequest(this)
  }

  async initFirst(){
    this.global.types = this.mscp.setupHandler.setup.entity.types
    this.global.types["folder"] = {
      title: "Folder",
      icon: "/mscp/libs/img/folder.png"
    }
    this.global.accessManager = new AccessTokenManager({secret: this.mscp.setupHandler.setup.accessTokenSecret})
  }

  async validateAccess(functionName){
    return this.username ? true : false
  }

  async folder(path){
    path = this.cleanFolderPath(path)
    let folderId = this.folderPath2Id(path)
    if(path == "/"){
      let folder = {path: "/", title: "root"}
      folder.content = (await this.search(`rel:${folderId}=entity_infolder`, true)).map((e) => this.convertEntityToClient(e))
      return folder
    } else {
      let folderRes = await this.meta.find(`id:${folderId}`, true)
      if(folderRes.length > 0){
        let folder = this.convertEntityToClient(folderRes[0])
        folder.path = path
        folder.content = (await this.search(`rel:${folderId}=entity_infolder`, true)).map((e) => this.convertEntityToClient(e))
        return folder
      }
      return null
    }
  }

  async types(){
    return this.global.types
  }

  async search(query, fillMetadata){
    //TODO: parse query here, to be sure that it isn't something like: ")|(prop:owner=hacker"
    let entities = await this.meta.find(`prop:"owner=${this.username}" (${query})`, fillMetadata || false)
    return fillMetadata ? entities.map((e) => this.convertEntityToClient(e)) : entities
  }

  async add(path, type, title, uniqueIdentifier, properties){
    if(!title)
      throw "Title not provided"

    properties = properties || {}
    let parentFolderPath = this.folderPath2Id(path)
    let entityId = null
    if(type == "folder"){
      entityId = this.folderPath2Id(`${this.cleanFolderPath(path)}${title}`)
    } else if(this.global.types[type] !== undefined){
      entityId = uuid.v4()
      properties.identifier = uniqueIdentifier
    } else {
      throw "Unknown type: " + type
    }

    properties.type = type
    properties.owner = this.username
    properties.title = title
    await this.meta.addRelation(parentFolderPath, entityId, "entity_folder_contains")
    await this.meta.addRelation(entityId, parentFolderPath, "entity_infolder")
    await this.meta.setProperties(entityId, properties)
    return entityId
  }

  async remove(path, id){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    let folderId = this.folderPath2Id(path)
    await this.meta.removeRelation(id, folderId, "entity_infolder")
    await this.meta.removeRelation(folderId, id, "entity_folder_contains")
    return true
  }

  async tag(id, tag){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    await this.meta.addTag(id, `entity_utag_${tag}`)
    return await this.search(`id:${id}`, true)
  }

  async setProperty(id, property, value){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    if(property == "title" && (await this.search(`id:${id} prop:type=folder`)).length > 0) throw "You can not change title of folders"
    if(property === "id" || property == "type" || property == "owner" || property == "identifier") throw "Can't edit this property"
    await this.meta.setProperty(id, property, value)
    return await this.search(`id:${id}`, true)
  }

  async validateEntityAccess(id){
    if(this.global.userAccessPermissionCache === undefined) this.global.userAccessPermissionCache = {}
    if(this.global.userAccessPermissionCache[this.username] === undefined) this.global.userAccessPermissionCache[this.username] = {}
    if(this.global.userAccessPermissionCache[this.username][id] === undefined){
      let entity = await this.meta.find(`id:${id}`, true)
      this.global.userAccessPermissionCache[this.username][id] = (entity.length < 1 || !entity[0].properties.owner || entity[0].properties.owner == this.username)
    }
    return this.global.userAccessPermissionCache[this.username][id]
  }

  async getEntityAccessToken(id, writeAccess){
    if(!(await this.validateEntityAccess(id))) return null;
    return this.global.accessManager.genToken(id, writeAccess === true ? "write" : "read");
  }

  folderPath2Id(path){
    path = this.cleanFolderPath(path)
    return crypto.createHash('sha256').update(`${this.username}:folder:${path.toLowerCase()}`).digest('hex');
  }

  cleanFolderPath(path){
    return path.endsWith("/") ? path : (path + "/")
  }

  convertEntityToClient(e){
    let retEntity = {id: e.id, tags:[], properties: {}}
    for(let i = 0; i < (e.tags||[]).length; i++){
      if(e.tags[i].startsWith("entity_utag_"))
        retEntity.tags.push(e.tags[i].substring("entity_utag_".length))
    }
    for(let p in e.properties){
      //if(["id", "identifier", "type"].indexOf(p) < 0)
        retEntity.properties[p] = e.properties[p]
    }
    return retEntity
  }
}

module.exports = Handler
