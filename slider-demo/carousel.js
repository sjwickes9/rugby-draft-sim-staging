class CarouselPicker {


constructor(options){

    this.element =
        typeof options.element === "string"
            ? document.querySelector(options.element)
            : options.element;


    this.values = options.values || [];

    this.index =
        Math.max(
            0,
            this.values.indexOf(options.value)
        );


    this.onChange =
        options.onChange || function(){};


    this.velocity = 0;

    this.position = this.index;

    this.target = this.index;

    this.dragging = false;

    this.startX = 0;

    this.lastX = 0;

    this.lastTime = 0;


    this.itemSpacing = 110;


    this.build();

    this.bind();

    this.render();

}



get value(){

    return this.values[
        Math.round(this.position)
    ];

}



build(){

    this.element.innerHTML = "";


    this.glow =
        document.createElement("div");

    this.glow.className =
        "carousel-glow";


    this.track =
        document.createElement("div");

    this.track.className =
        "carousel-track";


    this.items =
        this.values.map((value,index)=>{


            const item =
                document.createElement("div");


            item.className =
                "carousel-item";


            item.textContent =
                value;


            item.setAttribute(
                "role",
                "option"
            );


            item.setAttribute(
                "aria-label",
                value
            );


            item.addEventListener(
                "click",
                ()=>{
                    this.setValue(value);
                }
            );


            this.track.appendChild(item);


            return item;

        });


    this.element.appendChild(this.glow);

    this.element.appendChild(this.track);


}



bind(){

    this.element.tabIndex = 0;


    this.element.addEventListener(
        "pointerdown",
        e=>this.startDrag(e)
    );


    window.addEventListener(
        "pointermove",
        e=>this.drag(e)
    );


    window.addEventListener(
        "pointerup",
        ()=>this.endDrag()
    );


    this.element.addEventListener(
        "wheel",
        e=>{

            e.preventDefault();

            if(e.deltaY > 0)
                this.next();
            else
                this.previous();

        },
        {
            passive:false
        }
    );


    this.element.addEventListener(
        "keydown",
        e=>{

            if(e.key==="ArrowRight")
                this.next();


            if(e.key==="ArrowLeft")
                this.previous();

        }
    );

}



startDrag(e){

    this.dragging=true;

    this.velocity=0;

    this.startX=e.clientX;

    this.lastX=e.clientX;

    this.lastTime=performance.now();

}



drag(e){

    if(!this.dragging)
        return;


    const now =
        performance.now();


    const delta =
        e.clientX-this.lastX;


    const distance =
        delta / this.itemSpacing;


    this.position -= distance;


    this.velocity =
        distance /
        ((now-this.lastTime)/16);


    this.lastX=e.clientX;

    this.lastTime=now;


    this.clamp();

}



endDrag(){

    if(!this.dragging)
        return;


    this.dragging=false;


    this.velocity *= 4;


    this.animate();

}



animate(){

    if(this.dragging)
        return;


    this.position += this.velocity;


    this.velocity *= .92;


    if(Math.abs(this.velocity)<0.002){

        this.target =
            Math.round(this.position);


        this.target =
            Math.max(
                0,
                Math.min(
                    this.values.length-1,
                    this.target
                )
            );

    }


    const spring =
        (this.target-this.position)*.18;


    this.position += spring;


    this.clamp();


    this.render();


    if(
        Math.abs(this.velocity)>0.002 ||
        Math.abs(this.target-this.position)>.001
    ){

        requestAnimationFrame(
            ()=>this.animate()
        );

    }
    else {

        this.position=this.target;

        this.render();

        this.onChange(
            this.value
        );

    }


}



render(){

    const centre =
        this.element.clientWidth/2;


    this.items.forEach(
        (item,index)=>{


            const distance =
                index-this.position;


            const x =
                centre +
                distance*this.itemSpacing;


            const abs =
                Math.abs(distance);


            const scale =
                1 -
                Math.min(
                    abs*.09,
                    .35
                );


            const opacity =
                Math.max(
                    .25,
                    1-(abs*.22)
                );


            const y =
                Math.min(
                    abs*5,
                    15
                );


            item.style.transform =
            `
            translate(
                ${distance * this.itemSpacing}px,
                calc(-50% + ${y}px)
            )
            scale(${scale})
            `;


            item.style.opacity =
                opacity;


            item.classList.toggle(
                "selected",
                abs<0.01
            );


            item.setAttribute(
                "aria-selected",
                abs<0.01
            );

        }
    );

}



clamp(){

    this.position =
        Math.max(
            -1,
            Math.min(
                this.values.length,
                this.position
            )
        );

}



setValue(value){

    const index =
        this.values.indexOf(value);


    if(index===-1)
        return;


    this.target=index;

    this.velocity=0;

    this.animate();

}



next(){

    this.target =
        Math.min(
            this.values.length-1,
            Math.round(this.position)+1
        );


    this.animate();

}



previous(){

    this.target =
        Math.max(
            0,
            Math.round(this.position)-1
        );


    this.animate();

}


}


window.CarouselPicker =
    CarouselPicker;
