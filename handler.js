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

  async folder(id){
    if(!id){
      let folder = {id: this.rootFolderId(), path: "/", properties: {title: "Root"}}
      folder.content = (await this.search(`rel:${folder.id}=entity_infolder`, true))
      return folder
    } else {
      let folderRes = await this.meta.find(`id:${id}`, true)
      if(folderRes.length > 0){
        let folder = this.convertEntityToClient(folderRes[0])
        folder.content = (await this.search(`rel:${id}=entity_infolder`, true))
        folder.title = folder.properties.title
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

  async add(folderId, type, title, uniqueIdentifier, properties){
    if(!title)
      throw "Title not provided"

    properties = properties || {}
    let entityId = uuid.v4()
    if(this.global.types[type] !== undefined){
      properties.identifier = uniqueIdentifier
    } else if(type != "folder"){
      throw "Unknown type: " + type
    }

    properties.type = type
    properties.owner = this.username
    properties.title = title
    let parentFolderId = folderId || this.rootFolderId()
    await this.meta.addRelation(parentFolderId, entityId, "entity_folder_contains")
    await this.meta.addRelation(entityId, parentFolderId, "entity_infolder")
    await this.meta.setProperties(entityId, properties)
    return entityId
  }

  async remove(folderId, id){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    folderId = folderId || this.rootFolderId()
    await this.meta.removeRelation(id, folderId, "entity_infolder")
    await this.meta.removeRelation(folderId, id, "entity_folder_contains")
    return true
  }

  async move(id, fromFolderId, toFolderId){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    let rootFolderId = this.rootFolderId()
    fromFolderId = fromFolderId || rootFolderId
    toFolderId = toFolderId || rootFolderId
    if(id == rootFolderId) throw "You cannot move the root folder"
    if(fromFolderId == toFolderId) return false;
    await this.remove(fromFolderId, id)
    await this.meta.addRelation(toFolderId, id, "entity_folder_contains")
    await this.meta.addRelation(id, toFolderId, "entity_infolder")
    return true
  }

  async tag(id, tag){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    await this.meta.addTag(id, `entity_utag_${tag}`)
    return await this.search(`id:${id}`, true)
  }

  async setProperty(id, property, value){
    if(!(await this.validateEntityAccess(id))) throw `You do not have access to ${id}`
    //if(property == "title" && (await this.search(`id:${id} prop:type=folder`)).length > 0) throw "You can not change title of folders"
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

  async getEntityAccessToken(id, writeAccess, permanent){
    if(!(await this.validateEntityAccess(id))) return null;
    return this.global.accessManager.genToken(id, writeAccess === true ? "write" : "read", permanent === true ? true : undefined);
  }

  rootFolderId(){
    return crypto.createHash('sha256').update(`${this.username}:folder:/`).digest('hex');
  }

  /*
  cleanFolderPath(path){
    let ret = path;
    ret = ret.endsWith("/") ? ret : (ret + "/")
    ret = ret.startsWith("/") ? ret : ("/" + ret);
    return ret;
  }
  */

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
