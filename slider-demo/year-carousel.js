class YearCarousel {

    constructor(options){

        this.element =
            typeof options.element === "string"
            ? document.querySelector(options.element)
            : options.element;

        this.years = options.years || [];

        this.index =
            this.years.indexOf(options.value);

        if(this.index < 0){
            this.index = 0;
        }

        this.onChange =
            options.onChange || function(){};

        this.track =
            this.element.querySelector(".year-track");

        this.window =
            this.element.querySelector(".year-window");


        this.dragging = false;
        this.startX = 0;
        this.startOffset = 0;

        this.render();

        this.bind();

        this.update(false);
    }



    render(){

        this.track.innerHTML = "";

        this.years.forEach((year,i)=>{

            const el =
                document.createElement("div");

            el.className="year-item";

            el.textContent=year;

            el.dataset.index=i;

            el.onclick=()=>{
                this.setIndex(i);
            };

            this.track.appendChild(el);

        });

    }



    bind(){

        this.element
        .querySelector(".prev")
        ?.addEventListener(
            "click",
            ()=>this.previous()
        );


        this.element
        .querySelector(".next")
        ?.addEventListener(
            "click",
            ()=>this.next()
        );


        document.addEventListener(
            "keydown",
            e=>{

                if(
                    document.activeElement.tagName==="INPUT"
                )
                return;


                if(e.key==="ArrowLeft")
                    this.previous();


                if(e.key==="ArrowRight")
                    this.next();

            }
        );



        this.window.addEventListener(
            "wheel",
            e=>{

                e.preventDefault();

                if(e.deltaY>0)
                    this.next();
                else
                    this.previous();

            },
            {
                passive:false
            }
        );



        this.window.addEventListener(
            "pointerdown",
            e=>{

                this.dragging=true;

                this.startX=e.clientX;

                this.window.setPointerCapture(
                    e.pointerId
                );

            }
        );



        this.window.addEventListener(
            "pointerup",
            e=>{

                if(!this.dragging)
                    return;


                this.dragging=false;


                let distance =
                    e.clientX-this.startX;


                if(distance>40)
                    this.previous();


                if(distance<-40)
                    this.next();

            }
        );


    }




    previous(){

        this.setIndex(
            this.index-1
        );

    }


    next(){

        this.setIndex(
            this.index+1
        );

    }



    setIndex(i){

        if(i<0)
            i=0;

        if(i>=this.years.length)
            i=this.years.length-1;


        this.index=i;

        this.update(true);

    }



    update(emit=true){

        const items =
            [...this.track.children];


        items.forEach(
            (item,i)=>{

                item.classList.remove(
                    "selected",
                    "near"
                );


                let distance =
                    Math.abs(
                        i-this.index
                    );


                if(distance===0)
                    item.classList.add(
                        "selected"
                    );

                else if(distance===1)
                    item.classList.add(
                        "near"
                    );

            }
        );


        const width =
            this.window.clientWidth;


        const itemWidth =
            width / 5;


        const offset =
            (width/2)
            -
            (itemWidth/2)
            -
            (this.index*itemWidth);



        this.track.style.transition =
            "transform .35s cubic-bezier(.22,1,.36,1)";


        this.track.style.transform =
            `translateX(${offset}px)`;


        if(emit)
            this.onChange(
                this.years[this.index]
            );

    }



    get value(){

        return this.years[this.index];

    }


    setValue(year){

        let i =
            this.years.indexOf(year);

        if(i>=0)
            this.setIndex(i);

    }

}
