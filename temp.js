function sound(src, type){
  this.sound = document.createElement("audio");
  
  this.sound.src = src;
  let tp = src.split('.')[1];
  if (tp =='mp3') tp ='mpeg';
  this.sound.src.type = "audio/"+tp;
  
  this.sound.setAttribute("preload", "auto");
  this.sound.setAttribute("controls", "none");
  this.sound.style.display = "none";
  document.body.appendChild(this.sound);
  
  this.play = function(){
    this.sound.play();
  }
  
  this.stop = function(){
    this.pause();
    this.sound.currentTime = 0;
  }
  
  this.pause = function(){
    this.sound.pause();
  }
  
  this.fade = function(i,t){
    if(this.sound.volume > 0 && i < 0 || this.sound.volume < 1 && i > 0){ 
          this.sound.volume = Math.round((this.sound.volume + i)*100)/100;
          let q = this.fade(i,t);
          console.log(this.sound.volume);
          setTimeout(q, t);
      }else{
          this.pause;
      }
  
  }
}
