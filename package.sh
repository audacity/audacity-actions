#!/usr/bin/env bash

directories=(
    configure
    build
    package
    update_recipes
    generate_offline_dependencies
)

for directory in ${directories[@]}; do
    for filename in ${directory}/*.js; do
        echo "Packaging ${filename}"

        if [[ "${filename}" == *"index.js" ]]; then
            ncc build ${filename} -o dist/${directory} --minify --license licenses.txt
        else
            fname=$(basename ${filename})
            fbname=${fname%.*}
            ncc build ${filename} -o dist/${directory}/${fbname} --minify --license licenses.txt
        fi
    done
done

#ncc build configure/index.js -o dist/configure --license licenses.txt
#ncc build build/index.js -o dist/build  --license licenses.txt
#ncc build package/index.js -o dist/package  --license licenses.txt 
#ncc build update_recipes/index.js -o dist/update_recipes --license licenses.txt